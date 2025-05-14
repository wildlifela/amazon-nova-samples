# Speech-to-Speech Booking System

This repository contains a serverless booking system that leverages AWS Bedrock for natural language processing and DynamoDB for data storage. The system allows users to create, query, update, and delete bookings through a conversational interface.

## Architecture

The system consists of the following components:

1. **Bedrock Agent with Inline Orchestration** - Processes natural language requests and orchestrates interactions with the Lambda function
2. **Lambda Function** - Handles booking operations and interfaces with DynamoDB
3. **DynamoDB** - Stores booking data
4. **WebSocket Server** - Provides real-time communication for the speech interface

### Components

- `bedrock_agent.py` - Bedrock agent integration
- `inline_agent.py` - Inline agent orchestrator using Claude/Bedrock
- `booking/booking_lambda.py` - Lambda function handler for booking operations
- `booking/booking_db.py` - DynamoDB data access layer
- `booking/booking_openapi.json` - OpenAPI schema for the booking API
- `server.py` - WebSocket server for real-time communication
- `setup_booking_resources.sh` - Script to set up AWS resources
- `run_inline_agent.sh` - Script to run the inline agent
- `workshop-setup.sh` - Setup script for the workshop
- `booking/booking_action_group.py` - (deprecated) Booking action group definition

## Prerequisites

- Python 3.9+
- AWS CLI installed and configured
- AWS Bedrock access
- AWS Lambda and DynamoDB permissions

## Setup

1. Clone the repository
2. Run the setup script:

```bash
./workshop-setup.sh
```

This will:
- Create a Python virtual environment
- Install dependencies
- Set up environment variables
- Create AWS resources (Lambda function, DynamoDB table, etc.)

## Environment Variables

The following environment variables are used:

| Variable | Description | Default |
|----------|-------------|---------|
| AWS_REGION | AWS Region | us-east-1 |
| AWS_PROFILE | AWS CLI profile | nova |
| BOOKING_LAMBDA_ARN | ARN of the booking Lambda function | Set by setup_booking_resources.sh |
| TABLE_NAME | DynamoDB table name | Bookings |
| FOUNDATION_MODEL | Bedrock foundation model to use | amazon.nova-lite-v1:0 |
| HOST | WebSocket server host | 0.0.0.0 |
| WS_PORT | WebSocket server port | 8765 |
| HEALTH_PORT | Health check port | 8080 |
| LOG_LEVEL | Logging level | INFO |

## Usage

### Testing the Inline Agent

To test the agent with a query:

```bash
source .venv/bin/activate
./run_inline_agent.sh
```

Example queries:
- "Create a booking for John Doe tomorrow at 3pm for carpet cleaning"
- "When is John's booking?"
- "Cancel John's booking"

### Running the WebSocket Server

To start the WebSocket server:

```bash
source .venv/bin/activate
python server.py
```

### Direct API Operations

You can interact with the system programmatically:

```python
from inline_agent import InlineAgentOrchestrator

agent = InlineAgentOrchestrator()
response = agent.invoke("Create a booking for Sarah on Tuesday at 2pm")
print(response)
```

## Booking API

The Booking API supports the following operations:

- `getBooking` - Get a booking by ID
- `createBooking` - Create a new booking
- `updateBooking` - Update an existing booking
- `deleteBooking` - Delete a booking
- `listBookings` - List all bookings
- `findBookingsByCustomer` - Find bookings by customer name

## Troubleshooting

### Common Issues

- **Authentication errors**: Ensure AWS credentials are configured correctly with `aws configure`
- **Missing Lambda ARN**: Run `setup_booking_resources.sh` to create and configure the Lambda function
- **Environment variable issues**: Ensure the `.env` file is properly sourced in your shell

### Logs

- Lambda logs are available in CloudWatch Logs under `/aws/lambda/BookingFunction`
- Bedrock logs can be found in CloudWatch Logs under `bedrock-logs`

## Development

### Adding New Features

1. Update the OpenAPI schema in `booking/booking_openapi.json`
2. Add corresponding handler methods in `booking/booking_lambda.py`
3. Implement any necessary database operations in `booking/booking_db.py`

### Testing

Run the Lambda function locally:

```bash
python -c "from booking/booking_lambda import lambda_handler; print(lambda_handler({'apiPath': '/listBookings'}, {}))"
```

## Security Considerations

- AWS credentials should be kept secure and not hardcoded
- Use the principle of least privilege for IAM roles
- Consider encrypting sensitive data at rest in DynamoDB

## License

This project is licensed under the MIT License - see the LICENSE file for details. 