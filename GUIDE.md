# Cloud Resume Challenge (AWS) — Full Step-by-Step Guide

This walks through every part of the challenge in order. Each part says
exactly which AWS console page to go to, what to click, and which file
in this project the code lives in. Do the parts in order — later parts
depend on resources created in earlier ones.

**Repo layout you should end up with:**
```
cloud-resume-project/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── backend/
│   ├── template.yaml
│   ├── src/
│   │   ├── app.py
│   │   └── requirements.txt
│   └── tests/
│       └── test_app.py
├── .github/
│   └── workflows/
│       ├── backend-deploy.yml
│       └── frontend-deploy.yml
└── GUIDE.md
```

**Two GitHub repos, not one**, per the official challenge spec: one for
the frontend, one for the backend/infra. You can start in one folder
locally (as laid out above) and split it into two repos when you get
to Part 7 — or create two repos from the start and put `frontend/` in
one and `backend/` + `.github/` in the other. Either works; two repos
is the traditional/graded structure.

---

## Part 0 — Prerequisites

- [ ] AWS account (you have this, plus your Cloud Practitioner cert — already on your resume)
- [ ] AWS CLI installed and configured: `aws configure` (needs an IAM user access key — see below)
- [ ] [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed
- [ ] Python 3.12 installed locally
- [ ] Git + a GitHub account
- [ ] A code editor (VS Code is fine)

**Create an IAM user for yourself** (don't use root credentials for any of this):
1. Go to **IAM console → Users → Create user**
2. Name it something like `resume-project-admin`
3. Attach policies: `AdministratorAccess` is easiest while learning (tighten later if you want the practice) — or scope to `AmazonS3FullAccess`, `CloudFrontFullAccess`, `AWSLambda_FullAccess`, `AmazonDynamoDBFullAccess`, `AmazonAPIGatewayAdministrator`, `AmazonRoute53FullAccess`, `IAMFullAccess`, `AWSCloudFormationFullAccess`
4. **IAM → Users → your user → Security credentials → Create access key** → choose "Command Line Interface (CLI)"
5. Save the Access Key ID and Secret Access Key — run `aws configure` locally and paste them in

---

## Part 1 — Frontend: S3 static hosting

Your `frontend/index.html`, `styles.css`, and `script.js` already exist in this project.

1. **S3 console → Create bucket**
   - Bucket name: must be globally unique, e.g. `yourname-resume-site` (doesn't need to match your domain if you're using CloudFront in front of it)
   - Region: `us-east-1` (keeps things simple later for ACM)
   - **Uncheck** "Block all public access" — you'll lock this down properly with CloudFront + a bucket policy in Part 2, so leave it open for now only if you're testing directly; otherwise leave blocked and skip straight to Part 2's OAC setup, which is the recommended path
2. Upload `index.html`, `styles.css`, `script.js` (drag and drop, or use the CLI: `aws s3 sync frontend/ s3://yourname-resume-site`)
3. **Bucket → Properties → Static website hosting → Edit**
   - Enable it, set index document to `index.html`
   - Note the S3 website endpoint URL shown — you can sanity-check the page loads here before CloudFront is wired up (only works if you allowed public access above)

You do **not** need to leave the bucket public if you're going straight to CloudFront — see Part 2, which uses Origin Access Control (OAC) so only CloudFront can read the bucket, and the public S3 website endpoint isn't used at all in that setup (recommended, more secure).

---

## Part 2 — CloudFront (HTTPS) + ACM certificate + Route 53 domain

**2a. Buy a domain**
- **Route 53 console → Domains → Registered domains → Register domain**
- Search for your desired domain, add to cart, complete registration (~$10–15/yr depending on TLD)
- This automatically creates a **Hosted Zone** for the domain too

**2b. Request a TLS certificate (must be in us-east-1 for CloudFront)**
- **Certificate Manager (ACM) console** — make sure the region selector top-right says **US East (N. Virginia) us-east-1**, regardless of where your other resources live
- **Request a certificate → Request a public certificate**
- Domain names: add both `yourdomain.com` and `www.yourdomain.com`
- Validation method: **DNS validation**
- After requesting, click into the certificate and click **"Create records in Route 53"** — this auto-adds the CNAME validation records since your hosted zone is already in Route 53
- Wait for status to flip to "Issued" (usually a few minutes)

**2c. Create the CloudFront distribution**
- **CloudFront console → Create distribution**
- Origin domain: select your S3 bucket (pick the bucket, not the website endpoint, so you can use OAC)
- Origin access: **Origin access control settings (recommended)** → create a new OAC
- After creating the distribution, CloudFront will show a banner telling you to update the S3 bucket policy — click **"Copy policy"** and paste it into **S3 → your bucket → Permissions → Bucket policy**
- Viewer protocol policy: **Redirect HTTP to HTTPS**
- Alternate domain names (CNAMEs): `yourdomain.com`, `www.yourdomain.com`
- Custom SSL certificate: select the ACM cert from step 2b
- Default root object: `index.html`
- Create the distribution — takes 5–15 minutes to deploy

**2d. Point your domain at CloudFront**
- **Route 53 console → Hosted zones → your domain → Create record**
- Record type: **A**
- Toggle **Alias** on → Route traffic to → **Alias to CloudFront distribution** → select your distribution
- Repeat for the `www` subdomain (or add a CNAME redirecting www → root)

At this point `https://yourdomain.com` should load your resume over HTTPS. ✅ Frontend, HTTPS, and DNS are done.

---

## Part 3 — Backend: DynamoDB + Lambda + API Gateway

All defined as code in `backend/template.yaml` — you won't click these out manually, SAM creates them.

**What's in `template.yaml`:**
- A DynamoDB table (`resume-visitor-count`) with a simple `id` partition key
- A Lambda function (`backend/src/app.py`) that does an atomic `update_item` increment and returns the new count as JSON
- An API Gateway REST API with a `GET /count` route wired to the Lambda, plus CORS enabled

**Deploy it locally first (before CI/CD exists):**
```bash
cd backend
sam build
sam deploy --guided
```
`--guided` will ask you for a stack name (`cloud-resume-backend`), region, and confirm IAM role creation — say yes. It writes your answers to `samconfig.toml` so future `sam deploy` calls don't need `--guided`.

When it finishes, look at the **Outputs** section in the terminal (or **CloudFormation console → cloud-resume-backend → Outputs** tab) for `ApiUrl`. It looks like:
```
https://abcd123456.execute-api.us-east-1.amazonaws.com/prod/count
```

**Wire it into the frontend:**
- Open `frontend/script.js`
- Replace `[YOUR_API_GATEWAY_INVOKE_URL]` with the `ApiUrl` value above
- Re-upload to S3: `aws s3 sync frontend/ s3://yourname-resume-site --delete`
- Invalidate the CloudFront cache so it picks up the change:
  ```bash
  aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
  ```
- Reload your site — you should see the visitor count appear and increment on each page load

---

## Part 4 — Tests

`backend/tests/test_app.py` uses `moto` to mock DynamoDB so tests run without touching real AWS resources.

```bash
pip install pytest boto3 moto
cd backend
pytest tests -v
```

It checks: first request returns count 1, count increments across calls, the response includes the CORS header, and an OPTIONS preflight doesn't increment the counter.

---

## Part 5 — Infrastructure as Code

Already done — `backend/template.yaml` is your IaC (AWS SAM, which is CloudFormation under the hood). This satisfies the "don't click around in the console for your API resources" requirement. The only things you configured manually via console were the frontend (S3/CloudFront/ACM/Route 53) and your IAM user — which is normal even in most real-world CRC submissions, since those are largely one-time setup steps.

If you want to go further as a portfolio flex later, you could also move the S3/CloudFront/Route 53/ACM setup into the same `template.yaml` (or a second one) so the *entire* stack is IaC. Not required, but a nice extension.

---

## Part 6 — Two GitHub repos + CI/CD

**Set up the repos:**
```bash
# from inside cloud-resume-project/
cd frontend
git init && git add . && git commit -m "Initial resume site"
git remote add origin https://github.com/yourname/cloud-resume-frontend.git
git push -u origin main

cd ../backend
git init && git add . && git commit -m "Initial backend"
# also move .github/workflows/backend-deploy.yml into this repo's .github/workflows/
git remote add origin https://github.com/yourname/cloud-resume-backend.git
git push -u origin main
```
Put `frontend-deploy.yml` in the frontend repo's `.github/workflows/`, and `backend-deploy.yml` in the backend repo's `.github/workflows/`.

**Add GitHub Secrets** (each repo → Settings → Secrets and variables → Actions → New repository secret):

*Frontend repo needs:*
| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | from your IAM user |
| `AWS_SECRET_ACCESS_KEY` | from your IAM user |
| `S3_BUCKET_NAME` | e.g. `yourname-resume-site` |
| `CLOUDFRONT_DISTRIBUTION_ID` | from the CloudFront console |

*Backend repo needs:*
| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | from your IAM user |
| `AWS_SECRET_ACCESS_KEY` | from your IAM user |

**What each workflow does:**
- `frontend-deploy.yml`: on every push to `main` that touches `frontend/`, syncs the folder to S3 and invalidates CloudFront
- `backend-deploy.yml`: on every push to `main` that touches `backend/`, runs `pytest` first, and only deploys via `sam deploy` if tests pass

Push a small change (like fixing a typo in the resume) to confirm the pipeline actually fires and the site updates automatically.

⚠️ **Never commit AWS credentials to the repo.** They belong in GitHub Secrets only, never in a `.env` file that gets committed, never hardcoded in the workflow YAML.

---

## Part 7 — Write the blog post

Requirement: a short post describing something you learned. Dev.to or Hashnode are both fine and free. Link it from your resume site (e.g., in the Projects section entry for this project). Good topics: the CORS/OPTIONS preflight gotcha, why atomic `update_item` matters over read-then-write for a counter, or the OAC vs. public-bucket tradeoff.

---

## Checklist (matches the official challenge spec)

- [ ] Resume in HTML, styled with CSS
- [ ] Static website hosted on S3
- [ ] HTTPS via CloudFront
- [ ] Custom domain via Route 53
- [ ] JS-based visitor counter
- [ ] Counter data stored in DynamoDB
- [ ] Counter served via API Gateway + Lambda (Python/boto3)
- [ ] Unit tests for the Lambda code
- [ ] Infrastructure as Code (SAM/CloudFormation) for the backend
- [ ] Two GitHub repos with CI/CD (GitHub Actions) — frontend auto-deploys to S3+CloudFront, backend auto-tests and auto-deploys
- [ ] Blog post linked from the site
- [ ] AWS Cloud Practitioner cert on the resume (already done ✅)

---

## Cost reminder

Per the earlier estimate: this whole setup runs roughly **$1–2/month** (mostly the Route 53 hosted zone) plus the one-time domain registration. Set a **Billing console → Budgets** alert at $5 and $20 now, before you forget.
