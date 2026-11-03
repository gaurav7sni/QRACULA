# QRacula — QR Code Security Scanner

**QRacula** scans a QR code or a pasted link and tells you whether it leads
somewhere safe, suspicious or dangerous — and why.

## How it works

1. The browser reads the QR code locally.
2. The decoded link is sent to the QRacula backend on AWS.
3. The backend checks it with VirusTotal and applies fixed verdict rules.
4. Amazon Bedrock writes a plain-language explanation of the result.
5. The result — verdict, reasons, destination and recommendation — is shown.

## Tech stack

**Frontend:** React 19 · TypeScript · Vite · Tailwind CSS 4  
**Backend:** Python 3.12 · AWS Lambda · Lambda Function URL · DynamoDB  
          · SSM Parameter Store · Amazon Bedrock  
**Security data:** VirusTotal v3  

## Deploy

Frontend on AWS Amplify — see `amplify.yml`.  
Set `VITE_API_URL` in Amplify environment variables to the Lambda Function URL.
