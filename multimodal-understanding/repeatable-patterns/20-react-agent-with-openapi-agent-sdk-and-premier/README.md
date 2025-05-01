# Amazon Nova Premier Agent Samples

## Overview

Amazon Bedrock Nova Premier is Amazon's advanced large language model (LLM) designed specifically for complex reasoning tasks and agentic applications. This sample code demonstrate how to leverage Nova Premier's capabilities with popular agent frameworks to build sophisticated AI solutions.

## Notebook

### Data Analysis Agent with OpenAI Agents SDK

**Filename:** `01_Data_Analysis_Agent_with_OpenAI_SDK.ipynb`

This notebook demonstrates how to use Amazon Nova Premier with the OpenAI Agents SDK to build a data analysis agent. The agent can:

- Analyze dataset information and generate insights
- Perform statistical analysis on data
- Provide comprehensive data reports

Key features:
- Integration with OpenAI Agents SDK
- Custom function tools for data analysis
- Statistical processing capabilities
- Structured data reporting

## Prerequisites

To run these notebooks, you'll need:

1. An AWS account with access to Amazon Bedrock
2. Amazon Bedrock model access enabled for Nova Premier (model ID: `us.amazon.nova-premier-v1:0`)
3. Proper AWS credentials configured
4. Python 3.10+ with Jupyter Notebook or JupyterLab installed

## Setup

1. Configure AWS credentials with Amazon Bedrock access
   - Either through AWS CLI: `aws configure`
   - Or by setting environment variables
   - Or by using IAM roles (recommended for SageMaker environments)

2. Enable Amazon Bedrock models in your AWS account
   - Follow [this link](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access-modify.html) for instructions on enabling model access

## Usage

1. Start Jupyter Notebook, JupyterLab or your preferred Jupyter environment.

2. Open any of the sample notebooks and follow the step-by-step instructions within

3. Make sure to update the `region` variable in the notebooks if you're using a region other than `us-east-1`

## Additional Resources

- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [OpenAI Agents SDK Documentation](https://github.com/openai/openai-agents-python)

## Important Notes

- These notebooks use Amazon Nova Premier which is billed on an on-demand basis. Please review [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) for cost details.
- Amazon Nova Premier supports cross-region inference. Check available regions in the [documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html).
- Sample code is provided for demonstration purposes and may need adjustments for production use.