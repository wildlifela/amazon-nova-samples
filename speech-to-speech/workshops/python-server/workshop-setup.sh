# This is only required by the instructor-led workshop
#!/bin/bash

# Start virtual environment
python3 -m venv .venv
source .venv/bin/activate

# install dependencies
pip install -r requirements.txt

# Set websocket server host and port
export HOST="0.0.0.0"
export WS_PORT=8081
