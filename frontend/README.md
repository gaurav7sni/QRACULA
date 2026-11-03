# QRacula — QR Code Security Scanner

**QRacula** checks the link behind a QR code and tells you whether it is safe,
suspicious or dangerous — and why.

Scan a QR code with your camera, upload an image, or paste a link directly.
QRacula checks it against live security sources and explains the result in plain
language.

## How it works

1. The browser reads the QR code locally (nothing is uploaded).
2. The decoded link is sent to the QRacula backend on AWS.
3. The backend checks it with VirusTotal, applies fixed verdict rules, and uses
   Amazon Bedrock to write a plain-language explanation.
4. The result — verdict, reasons, destination and recommendation — is shown on
   screen.

## Tech stack

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4  
**Backend:** Python 3.12, AWS Lambda, Lambda Function URL, Amazon DynamoDB,
AWS Systems Manager Parameter Store, Amazon Bedrock  
**Security data:** VirusTotal v3 API  

## Running locally

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # add your Function URL
npm run dev
```

## Deploying

The frontend is deployed on AWS Amplify. The `amplify.yml` file handles the
build. Set `VITE_API_URL` in Amplify's environment variables to the Lambda
Function URL.

Backend deploy instructions are in `../qr-backend/README.md`.
