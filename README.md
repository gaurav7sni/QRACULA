# QRACULA

QR Code Security Scanner — checks the link behind a QR code.

## Structure

```
frontend/   React + TypeScript site, deploys to AWS Amplify
backend/    Python Lambda backend, deploys with AWS SAM
```

## Frontend

Deploy on AWS Amplify. Connect this repo, set root directory to `frontend`,
and add environment variable `VITE_API_URL` = your Lambda Function URL.

## Backend

See `backend/README.md` for full deploy instructions.
Quick start:
```bash
cd backend
aws ssm put-parameter --region ap-southeast-2 \
  --name /qracula/virustotal-api-key \
  --type SecureString --value "YOUR_VT_KEY"
sam build && sam deploy --guided
```
