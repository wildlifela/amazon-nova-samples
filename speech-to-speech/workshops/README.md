# Sample code for Nova S2S workshop

This project is for the Amazon Nova Sonic speech-to-speech (S2S) workshop and is intended for training purposes. It showcases a sample architecture for building applications that integrate with Nova Sonic, with features specifically designed to expose technical details for educational use.


For architectures that require an internet-exposed connection to serve mobile or web clients, the following approach is recommended:

![architecture](./static/nova-sonic-sample-architecture.png)

The project includes two core components:
- A Python-based WebSocket server that manages the bidirectional streaming connection with Nova Sonic.
- A React front-end application that communicates with the S2S system through the WebSocket server.


## Repository Structure
```
nova-s2s-workshop/
├── python-server/                              # Python application serves web socket service and health check HTTP endpoint(optional)
│   ├── server.py                               # Main entry point: starts websocket and health check (optional) servers
│   ├── s2s_session_manager.py                  # Nova Sonic bidirectional streaming logic incapsulated
│   ├── s2s_events.py                           # Utlility class construct Nova Sonic events
│   ├── bedrock_knowledge_bases.py              # Sample Bedrock Knowledge Bases implementation
│   └── requirements.txt                        # Python dependencies
└── react-client/                               # Web client implementation
    ├── src/
    │   ├── helper/
    │   │   ├── audioHelper.js                  # Audio utility functions for encoding/decoding
    │   │   └── s2sEvents.js                    # Utlility class construct Nova Sonic events
    │   ├── static/                             # Images
    │   ├── App.js                              # Define website layout and navigation
    │   ├── index.js                            # Main entry point
    │   └── s2s.js                              # Main entry point
    └── package.json                            # REACT manifest file
```

### Prerequisites
- Python 3.12+
- Node.js 14+ and npm/yarn for UI development
- AWS account with Bedrock access
- AWS credentials configured locally

### Install and start the Python websocket server

1. Clone the repository:
    ```bash
    git clone https://github.com/aws-samples/amazon-nova-samples
    mv amazon-nova-samples/speech-to-speech/workshops nova-s2s-workshop
    rm -rf amazon-nova-samples
    cd nova-s2s-workshop
    ```

2. Start Python virtual machine
    ```
    cd python-server
    python3 -m venv .venv
    ```
    Mac
    ```
    source .venv/bin/activate
    ```
    Windows
    ```
    .venv\Scripts\activate
    ```

3. Install Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```

4. Set environment variables:
    
    The AWS access key and secret are required for the Python application, as they are needed by the underlying Smithy authentication library.
    ```bash
    export AWS_ACCESS_KEY_ID="YOUR_AWS_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET"
    ```
    The WebSocket host and port must be specified:
    ```bash
    export HOST="localhost"
    export WS_PORT=8081
    ```
    The health check port is optional for container deployment such as ECS/EKS. If the environment variable below is not specified, the service will not start the HTTP endpoint for health checks.
    ```bash
    export HEALTH_PORT=8082 
    ```
    
    You can ignore the Bedrock Knowledge Base ID if you do not plan to test or implement Knowledge Base integration.
    ```bash
    export KB_ID='YOUR_KNOWLEDGE_BASES_ID'
    ```

5. Start the python websocket server
    ```bash
    python server.py
    ```

### Install and start the REACT frontend application
1. Navigate to the `react-client` folder
    ```bash
    cd react-client
    ```
2. Install
    ```bash
    npm install
    ```

3. Set up environment variables for the REACT app.

    If you've started the WebSocket from the previous step, set WS_URL to ws://localhost:8081
    ```bash
    export REACT_APP_WEBSOCKET_URL='ws://localhost:8081'
    ```

4. If you want to run the React code outside the workshop environment, update the `homepage` value in the `react-client/package.json` file from "/proxy/3000/" to "."

5. Run
    ```
    npm start
    ```