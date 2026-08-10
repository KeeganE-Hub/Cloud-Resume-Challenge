# AWS Cloud Resume Challenge

My resume, built as a real serverless AWS application instead of a static file — completed as part of the [Cloud Resume Challenge](https://cloudresumechallenge.dev/).

**Live site:** [https://keeganonthecloud.com/](https://keeganonthecloud.com/)

## Architecture

![Architecture diagram of the site: Route 53 and CloudFront deliver the static frontend from S3; a WebSocket API Gateway fronts two Lambda functions and two DynamoDB tables for the real-time visitor counter; GitHub Actions deploys the frontend directly to S3 and deploys the backend through AWS CloudFormation.](frontend/images/architecture-diagram.png)

## About this project

This isn't just a resume hosted online — it's a small full-stack AWS application. The frontend is a static site served over HTTPS through a CDN, and the "visitor counter" you'll see on it is backed by a real-time backend: every visit increments a count in a database, and a change stream pushes the updated number out to every other open tab live, no page refresh needed.

Click the **Technical Breakdown** button in the site's own nav bar for a plain-language walkthrough of every service used and why — no need to leave the page.

## Highlights

- Frontend deployed to **S3 + CloudFront**, with a custom domain through **Route 53** and a free TLS certificate from **ACM**.
- Real-time visitor counter built on a **WebSocket API Gateway**, two **Lambda** functions, and a **DynamoDB Stream** — the count updates live across every open browser tab.
- All backend logic runs on **AWS Lambda** — one function handles new WebSocket connections and disconnections, the other reacts to database changes and pushes the updated count back out. Neither one runs, or costs anything, except when something actually triggers it — no server sitting idle between requests.
- The original REST-based counter (the base version of the challenge) is kept in the codebase as a commented-out backup rather than deleted, alongside its own test suite.
- Entire backend defined as code with **AWS SAM** — one command rebuilds the whole stack from scratch.
- **CI/CD via GitHub Actions** — separate frontend/backend workflows that only trigger on changes to their own folder, so a CSS tweak doesn't trigger a backend redeploy and vice versa.
- Backend covered by a **pytest** suite using **moto** to mock AWS services, so tests run without touching real infrastructure.
- Light/dark theme toggle, an in-page technical breakdown view, and a "business card" contact popup — all built with plain HTML/CSS/JS, no frontend framework.

## Technologies used

**Frontend**
- HTML, CSS, JavaScript
- Responsive layout, light/dark theme support

**AWS**
- Amazon S3 — static site hosting
- Amazon CloudFront — CDN + HTTPS
- Amazon Route 53 — DNS and domain registration
- AWS Certificate Manager (ACM) — TLS certificate
- Amazon API Gateway — REST (backup) and WebSocket (active)
- AWS Lambda — Python 3.14
- Amazon DynamoDB + DynamoDB Streams
- AWS IAM
- AWS Budgets — cost monitoring/alerts

**Infrastructure & tooling**
- AWS SAM / CloudFormation — Infrastructure as Code
- GitHub Actions — CI/CD
- pytest + moto — backend unit testing
- boto3 — AWS SDK for Python

## What's next

Things worth doing beyond what's here now:
- Replace the static IAM access keys in GitHub Secrets with OIDC federation, so deploys authenticate with short-lived credentials instead of long-lived ones.
- Bring more of the manually-configured pieces (the S3 bucket policy, CloudFront, Route 53, ACM) into the SAM template, so the entire stack — not just the backend — is defined as code.
- Containerize the backend.
- Explore hosting on Kubernetes.

## File structure

```
Cloud-Resume-Challenge/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   └── images/
│       ├── architecture-diagram.png
│       ├── email.png, phone.png, location.png
│       ├── github.png, linkedin.png
│       └── theme-sun.png, theme-moon.png
│
├── backend/
│   ├── template.yaml           # SAM/CloudFormation - the whole backend as code
│   ├── src/
│   │   ├── app.py                  # REST counter - inactive backup
│   │   ├── dbupdater.py            # WebSocket $connect/$disconnect handler
│   │   ├── dbstreamprocessor.py    # pushes live count updates over the socket
│   │   └── requirements.txt
│   └── tests/
│       ├── test_app.py
│       ├── test_dbupdater.py
│       └── test_dbstreamprocessor.py
│
└── .github/
    └── workflows/
        ├── frontend-deploy.yaml    # syncs frontend/ to S3, invalidates CloudFront
        └── backend-deploy.yaml     # runs pytest, then sam deploy
```