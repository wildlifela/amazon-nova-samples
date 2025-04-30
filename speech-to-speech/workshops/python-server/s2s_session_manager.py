import asyncio
import json
import warnings
import uuid
from s2s_events import S2sEvent
import bedrock_knowledge_bases as kb
import time

from aws_sdk_bedrock_runtime.client import BedrockRuntimeClient, InvokeModelWithBidirectionalStreamOperationInput
from aws_sdk_bedrock_runtime.models import InvokeModelWithBidirectionalStreamInputChunk, BidirectionalInputPayloadPart
from aws_sdk_bedrock_runtime.config import Config, HTTPAuthSchemeResolver, SigV4AuthScheme
from smithy_aws_core.credentials_resolvers.environment import EnvironmentCredentialsResolver

import boto3
import json
import os

# Suppress warnings
warnings.filterwarnings("ignore")

class S2sSessionManager:
    """Manages bidirectional streaming with AWS Bedrock using asyncio"""
    
    def __init__(self, model_id, region, aws_key, aws_secret, logger=None):
        """Initialize the stream manager."""
        self.model_id = model_id
        self.region = region
        self.aws_key = aws_key
        self.aws_secret = aws_secret
        if logger:
            self.logger = logger
        
        # Audio and output queues
        self.audio_input_queue = asyncio.Queue()
        self.output_queue = asyncio.Queue()
        
        self.response_task = None
        self.stream = None
        self.is_active = False
        self.bedrock_client = None
        
        # Session information
        self.prompt_name = None  # Will be set from frontend
        self.content_name = None  # Will be set from frontend
        self.audio_content_name = None  # Will be set from frontend
        self.toolUseContent = ""
        self.toolUseId = ""
        self.toolName = ""

        # Boto3 clients
        self.sts_client = None
        self.lambda_client = None

    def _initialize_client(self):
        # Get session token from sts using key and secret and set to env varaibles
        if "AWS_SESSION_TOKEN" not in os.environ:
            self.sts_client = boto3.client(
                'sts',
                aws_access_key_id=self.aws_key,
                aws_secret_access_key=self.aws_secret,
                region_name=self.region,
            )
            response = self.sts_client.get_session_token(DurationSeconds=7200)
            credentials = response['Credentials']
            os.environ["AWS_ACCESS_KEY_ID"] = credentials['AccessKeyId']
            os.environ["AWS_SECRET_ACCESS_KEY"] = credentials['SecretAccessKey']
            os.environ["AWS_SESSION_TOKEN"] = credentials['SessionToken']

        # Init Lambda client
        self.lambda_client = boto3.client('lambda',
            aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
            aws_session_token=os.environ["AWS_SESSION_TOKEN"],
            region_name=self.region,
        )

        """Initialize the Bedrock client."""
        config = Config(
            endpoint_uri=f"https://bedrock-runtime.{self.region}.amazonaws.com",
            region=self.region,
            aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
            http_auth_scheme_resolver=HTTPAuthSchemeResolver(),
            http_auth_schemes={"aws.auth#sigv4": SigV4AuthScheme()}
        )
        self.bedrock_client = BedrockRuntimeClient(config=config)

    async def initialize_stream(self):
        """Initialize the bidirectional stream with Bedrock."""
        try:
            #if not self.bedrock_client:
            self._initialize_client()
        except Exception as ex:
            self.is_active = False
            self.logger.error(f"Failed to initialize Bedrock client: {str(e)}")
            raise

        try:
            # Initialize the stream
            self.stream = await self.bedrock_client.invoke_model_with_bidirectional_stream(
                InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
            )
            self.is_active = True
            
            # Start listening for responses
            self.response_task = asyncio.create_task(self._process_responses())

            # Start processing audio input
            asyncio.create_task(self._process_audio_input())
            
            # Wait a bit to ensure everything is set up
            await asyncio.sleep(0.1)
            
            self.logger.debug("Stream initialized successfully")
            return self
        except Exception as e:
            self.is_active = False
            self.logger.error(f"Failed to initialize stream: {str(e)}")
            raise
    
    async def send_raw_event(self, event_data):
        try:
            """Send a raw event to the Bedrock stream."""
            if not self.stream or not self.is_active:
                #self.logger.error("Stream not initialized or closed")
                return
            
            event_json = json.dumps(event_data)
            event = InvokeModelWithBidirectionalStreamInputChunk(
                value=BidirectionalInputPayloadPart(bytes_=event_json.encode('utf-8'))
            )
            await self.stream.input_stream.send(event)

            # Close session
            if "sessionEnd" in event_data["event"]:
                self.close()
            
        except Exception as e:
            self.logger.error(f"Error sending event: {str(e)}")
    
    async def _process_audio_input(self):
        """Process audio input from the queue and send to Bedrock."""
        while self.is_active:
            try:
                # Get audio data from the queue
                data = await self.audio_input_queue.get()
                
                # Extract data from the queue item
                prompt_name = data.get('prompt_name')
                content_name = data.get('content_name')
                audio_bytes = data.get('audio_bytes')
                
                if not audio_bytes or not prompt_name or not content_name:
                    self.logger.error("Missing required audio data properties")
                    continue

                # Create the audio input event
                audio_event = S2sEvent.audio_input(prompt_name, content_name, audio_bytes.decode('utf-8') if isinstance(audio_bytes, bytes) else audio_bytes)
                
                # Send the event
                await self.send_raw_event(audio_event)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error processing audio: {e}")
    
    def add_audio_chunk(self, prompt_name, content_name, audio_data):
        """Add an audio chunk to the queue."""
        # The audio_data is already a base64 string from the frontend
        self.audio_input_queue.put_nowait({
            'prompt_name': prompt_name,
            'content_name': content_name,
            'audio_bytes': audio_data
        })
    
    async def _process_responses(self):
        """Process incoming responses from Bedrock."""
        while self.is_active:
            try:            
                output = await self.stream.await_output()
                result = await output[1].receive()
                
                if result.value and result.value.bytes_:
                    response_data = result.value.bytes_.decode('utf-8')
                    
                    json_data = json.loads(response_data)
                    json_data["timestamp"] = int(time.time() * 1000)  # Milliseconds since epoch
                    
                    event_name = None
                    if 'event' in json_data:
                        event_name = list(json_data["event"].keys())[0]
                        # Handle tool use detection
                        if event_name == 'toolUse':
                            self.toolUseContent = json_data['event']['toolUse']
                            self.toolName = json_data['event']['toolUse']['toolName']
                            self.toolUseId = json_data['event']['toolUse']['toolUseId']
                            self.logger.info(f"Tool use detected: {self.toolName}, ID: {self.toolUseId}, "+ json.dumps(json_data['event']))

                        # Process tool use when content ends
                        elif event_name == 'contentEnd' and json_data['event'][event_name].get('type') == 'TOOL':
                            prompt_name = json_data['event']['contentEnd'].get("promptName")
                            self.logger.debug("Processing tool use and sending result")
                            tool_result, client_data = await self.processToolUse(self.toolName, self.toolUseContent)
                            if tool_result or client_data:
                                # Send tool start event
                                toolContent = str(uuid.uuid4())
                                tool_start_event = S2sEvent.content_start_tool(prompt_name, toolContent, self.toolUseId)
                                await self.send_raw_event(tool_start_event)
                                
                                # Send tool result event
                                if isinstance(tool_result, dict):
                                    content_json_string = json.dumps(tool_result)
                                else:
                                    content_json_string = tool_result
                                tool_result_event = S2sEvent.text_input_tool(prompt_name, toolContent, content_json_string)
                                await self.send_raw_event(tool_result_event)

                                # Send tool content end event
                                tool_content_end_event = S2sEvent.content_end(prompt_name, toolContent)
                                self.logger.debug(tool_content_end_event)
                                await self.send_raw_event(tool_content_end_event)

                                # Send customized client events to client app
                                if client_data:
                                    client_event = S2sEvent.client_custom(str(uuid.uuid4()), client_data)
                                    await self.output_queue.put(client_event)
                                    client_data = None
                    
                    # Put the response in the output queue for forwarding to the frontend
                    await self.output_queue.put(json_data)

            except json.JSONDecodeError as ex:
                self.logger.error(ex)
                await self.output_queue.put({"raw_data": response_data})
            except StopAsyncIteration as ex:
                # Stream has ended
                self.logger.error(ex)
            except Exception as e:
                # Handle ValidationException properly
                if "ValidationException" in str(e):
                    error_message = str(e)
                    self.logger.error(f"Validation error: {error_message}")
                else:
                    self.logger.error(f"Error receiving response: {e}")
                break

        self.is_active = False
        self.close()

    async def processToolUse(self, toolName, toolUseContent):
        try:
            """Return the tool result"""
            self.logger.info(f"Tool Use Content: {toolUseContent}")

            query, result, client_data = None, None, None
            query_json = json.loads(toolUseContent.get("content"))
            query = query_json.get("query", "")

            if toolName == "pass_through_function":
                return None, None
            
            if toolName.startswith("lambda_"):
                response = self.call_lambda(toolName.replace("lambda_",""), query)
                result = { "result_from_files": response.get("body").get("text")}

                # Default None
                # This service will send this value to the client app via the ws connection before the result of the external call is received.
                client_data = None
                if "citation" in response.get("body") and response.get("body").get("citation"):
                    client_data = {"citation": response.get("body").get("citation")}

            if toolName == "getKbTool":
                result = {"result": kb.retrieve_kb(query)}
            
            if toolName == "getDateTool":
                from datetime import datetime, timezone
                result = {"result": f"In UTC: {datetime.now(timezone.utc).strftime('%A, %Y-%m-%d %H-%M-%S')}"}
                
            return result, client_data
        except Exception as ex:
            self.logger.error(f"Failed to process ToolUse event. ToolName: {toolName}, ToolUseContext: {toolUseContent} Exception: {ex}")
    
    async def close(self):
        """Close the stream properly."""
        if not self.is_active:
            return
            
        self.is_active = False
        
        if self.stream:
            await self.stream.input_stream.close()
        
        if self.response_task and not self.response_task.done():
            self.response_task.cancel()
            try:
                await self.response_task
            except asyncio.CancelledError:
                pass

    def call_lambda(self, function_name, query):
        try:
            # Invoke the Lambda function
            response = self.lambda_client.invoke(
                FunctionName=function_name,  # replace with your function name
                InvocationType='RequestResponse',          # 'Event' for async
                Payload=json.dumps({"query": query})
            )

            # Read and decode the response
            response_payload = json.load(response['Payload'])
            return response_payload
        except Exception as ex:
            self.logger.error(ex)

