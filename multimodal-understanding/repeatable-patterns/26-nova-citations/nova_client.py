import boto3
import base64
import json
from botocore.exceptions import ClientError
import re
import time
import random
import os

DATA_BUCKET = os.environ.get('DATA_BUCKET')
MODEL_ID_LITE = "amazon.nova-lite-v1:0"
MODEL_ID_PRO = "amazon.nova-pro-v1:0"
MODEL_TO_TEST = MODEL_ID_PRO

def get_pdf_from_s3(bucket_name, file_key):
    """Retrieve PDF content from S3"""
    try:
        s3_client = boto3.client('s3')
        response = s3_client.get_object(Bucket=bucket_name, Key=file_key)
        pdf_content = response['Body'].read()
        return pdf_content
    except ClientError as e:
        print(f"Error retrieving file from S3: {e}")
        raise
    
def invoke_with_retry(client, **kwargs):
    """
    Helper function to retry API calls with exponential backoff
    """
    max_retries = 5
    base_delay = 1
    max_delay = 32
    
    for attempt in range(max_retries):
        try:
            return client.converse(**kwargs)
        
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            # Check if error is retryable
            if error_code in ['ModelErrorException', 'ThrottlingException', 'ServiceUnavailable']:
                if attempt == max_retries - 1:  # Last attempt
                    print(f"Max retries reached. Last error: {error_message}")
                    raise
                
                # Calculate delay with exponential backoff and jitter
                delay = min(max_delay, (2 ** attempt + random.uniform(0, 1)) * base_delay)
                print(f"Attempt {attempt + 1} failed with error: {error_message}")
                print(f"Retrying in {delay:.2f} seconds...")
                time.sleep(delay)
                continue
            else:
                # Non-retryable error
                print(f"Non-retryable error encountered: {error_message}")
                raise
        except Exception as e:
            print(f"Unexpected error: {str(e)}")
            raise

def sanitize_filename(filename):
    """
    Sanitize filename to meet Nova requirements:
    - Only alphanumeric characters, whitespace, hyphens, parentheses, and square brackets
    - No consecutive whitespace characters
    """
    # Get just the filename from the path
    filename = filename.split('/')[-1]
    
    # Replace invalid characters with hyphens
    sanitized = re.sub(r'[^a-zA-Z0-9\s\-\(\)\[\]]', '-', filename)
    
    # Replace consecutive whitespace with single space
    sanitized = re.sub(r'\s+', ' ', sanitized)
    
    return sanitized.strip()


def invoke_nova_with_pdf(model_id, question, pdf_files=None, max_tokens=1000, temperature=0.7):
    """
    Invoke Nova model with PDF context and question
    
    Args:
        model_id (str): Nova model ID (lite or pro)
        question (str): Question to ask
        pdf_files (list): List of dicts containing S3 bucket and key for PDFs
        max_tokens (int): Maximum tokens in response
        temperature (float): Temperature for response generation
    """
    try:
        # Initialize Bedrock Runtime client
        client = boto3.client('bedrock-runtime', region_name='us-east-1')
        
        # Prepare message content
        content = []
        
        # Add PDF documents if provided
        if pdf_files:
            for pdf_file in pdf_files:
                pdf_content = get_pdf_from_s3(pdf_file['bucket'], pdf_file['key'])
                sanitized_name = sanitize_filename(pdf_file['key'])
                content.append({
                    "document": {
                        "format": "pdf",
                        "name": sanitized_name,
                        "source": {
                            "bytes": pdf_content
                        }
                    }
                })
        trace_question = f"""{question}"""
        
        content.append({"text": trace_question})
        
        # Prepare the messages structure
        messages = [
            {
            "role": "user",
            "content": content
        }
            ]
        
        # Configure inference parameters
        inference_config = {
            "maxTokens": max_tokens,
            "temperature": temperature
        }
        
        # Make the API call with retry mechanism
        response = invoke_with_retry(
            client,
            modelId=model_id,
            messages=messages,
            inferenceConfig=inference_config
        )
        
        # Extract and return the response text
        return response['output']['message']['content'][0]['text']
    
    except Exception as e:
        print(f"Error in invoke_nova_with_pdf: {str(e)}")
        raise

def main():
      
    # Example PDF files in S3
    pdf_files = [
        {
            "bucket": DATA_BUCKET,
            "key": "amazon-shareholder-letters/All Amazon Shareholder Letters-1997.pdf" #All Amazon Shareholder Letters.pdf"#""
        }
    ]
    
    question="""You are a QA agent. You answer questions based on the context provided. You will answer teh question and also include exact excerpts from the context and quote them as quotes.
                ##Examples:
                Question: What factors contributed to the growth of Amazon
                Quotes: [1] Our
                vision for Kindle is every book ever printed in any language, all available in less than 60 seconds.
                Publishers—including all the major publishers—have embraced Kindle, and we’re thankful for that. From a
                publisher’s point of view, there are a lot of advantages to Kindle. Books never go out of print, and they never go
                out of stock. Nor is there ever waste from over-printing. Most important, Kindle makes it more convenient for
                readers to buy more books. Anytime you make something simpler and lower friction, you get more of it.
                Answer: Inovation with Kindle and publisher collaboration contributed to the growth of Amazon [1]
                ##Output Format
                Quotes: [1] ....
                [2] ...
                Answer:"""
    question_with_template = f"""{question} What contributed to net sales and decline of stock price? """
        #Extra instructions if needed   

    try:
        # Invoke with Nova Lite
        response = invoke_nova_with_pdf(
            model_id=MODEL_TO_TEST,
            question=question_with_template,
            pdf_files=pdf_files,
            max_tokens=2000, #2000 causes Attempt 4 failed with error: Too many tokens, please wait before trying again. Retrying in 8.18 seconds...
            temperature=0.7
        )
        
        print("Nova Response:")
        print(response)
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()


## Below is a response for Nova Pro with given S3 URI
"""
Nova Response:
Quotes: [1] Sales grew from $15.7 million in 1996 to $147.8 million -- an 838% increase.

[2] We aren't so bold as to claim that the above is the "right" investment philosophy, but it's ours, and we would be remiss if we weren't clear in the approach we have taken and will continue to take.

Answer: The growth in net sales was driven by the significant increase in sales from $15.7 million in 1996 to $147.8 million in 1997, representing an 838% increase [1]. However, the document does not explicitly mention a decline in stock price, but it does outline the company's investment philosophy, which may have implications for stock performance [2]."""