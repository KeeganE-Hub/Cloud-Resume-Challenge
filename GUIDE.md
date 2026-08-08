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
│   ├── script.js
│   └── images/
│       ├── email.png
│       ├── github.png
│       ├── linkedin.png
│       ├── location.png
│       └── phone.png
├── backend/
│   ├── template.yaml
│   ├── src/
│   │   ├── app.py               (REST handler, Part 3 - kept until Part 8 is done)
│   │   ├── dbupdater.py         (WebSocket $connect/$disconnect handler)
│   │   ├── dbstreamprocessor.py (pushes count updates over the socket)
│   │   └── requirements.txt
│   └── tests/
│       ├── test_app.py
│       ├── test_dbupdater.py
│       └── test_dbstreamprocessor.py
├── .github/
│   └── workflows/
│       ├── backend-deploy.yml
│       └── frontend-deploy.yml
└── GUIDE.md
```

Note: `app.py` and `test_app.py` are the original REST-based counter
from Part 3. They're kept in place alongside the Part 8 WebSocket
files so the live site keeps working throughout — see the cleanup
note at the end of Part 8 for when/how to remove them.

**One GitHub repo, not two** — the official challenge spec calls for splitting frontend/backend into separate repos, but plenty of people build this as a single repo with `frontend/`/`backend/` folders instead, and it's not treated as a hard requirement in practice. Went with one repo here since it's easier for a hiring manager to review the whole project in one place without hopping between two links.

---

## Part 0 — Prerequisites

- [ ] AWS account (you have this, plus your Cloud Practitioner cert — already on your resume)
- [ ] AWS CLI installed and configured: `aws configure` (needs an IAM user access key — see below)
- [ ] [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed
- [ ] Python 3.14 installed locally
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

> This is the original REST-based counter. If you go on to build the
> real-time WebSocket version in Part 8, both versions can coexist in
> the same deploy while you're transitioning — the REST resources
> here aren't deleted automatically, so the live site keeps working
> off this one until you've confirmed the WebSocket version works and
> choose to remove this section as a cleanup step.

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

## Part 6 — GitHub repo + CI/CD

**Set up the repo:**
```bash
# from inside cloud-resume-project/ - this whole folder becomes the repo,
# frontend/, backend/, and .github/ all stay together
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourname/cloud-resume-project.git
git push -u origin main
```
Both workflow files (`frontend-deploy.yml` and `backend-deploy.yml`) already live in `.github/workflows/` in this project, so there's nothing to move around — each one is already set up to only trigger on pushes that touch its own folder (`frontend/` or `backend/` respectively), so they won't step on each other.

**Add GitHub Secrets** (repo → Settings → Secrets and variables → Actions → New repository secret):

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | from your IAM user |
| `AWS_SECRET_ACCESS_KEY` | from your IAM user |
| `S3_BUCKET_NAME` | e.g. `yourname-resume-site` |
| `CLOUDFRONT_DISTRIBUTION_ID` | from the CloudFront console |

Since it's one repo now, both workflows pull from the same set of secrets — no need to duplicate `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` across two separate repos' settings pages like a two-repo setup would require.

**What each workflow does:**
- `frontend-deploy.yml`: on every push to `main` that touches `frontend/`, syncs the folder to S3 and invalidates CloudFront
- `backend-deploy.yml`: on every push to `main` that touches `backend/`, runs `pytest` first, and only deploys via `sam deploy` if tests pass

Push a small change (like fixing a typo in the resume) to confirm the pipeline actually fires and the site updates automatically.

⚠️ **Never commit AWS credentials to the repo.** They belong in GitHub Secrets only, never in a `.env` file that gets committed, never hardcoded in the workflow YAML.

---

## Part 7 — Write the blog post

Requirement: a short post describing something you learned. Dev.to or Hashnode are both fine and free. Link it from your resume site (e.g., in the Projects section entry for this project). Good topics: the CORS/OPTIONS preflight gotcha, why atomic `update_item` matters over read-then-write for a counter, or the OAC vs. public-bucket tradeoff.

---

## Part 8 — Extension: Real-time counter with WebSockets + DynamoDB Streams

This is an optional extension from the official Cloud Resume Challenge
site, not part of the base challenge. It adds a real-time counter that
pushes live updates to every open browser tab, instead of only
updating on refresh — running **alongside** the REST version from
Part 3 while you're setting it up and testing it, rather than
replacing it immediately. That way the live site keeps working the
whole time. Once you've confirmed the WebSocket version works
end-to-end, you can go back and delete the REST resources as a
cleanup step (see the note at the end of this section).

### How it works

```
Visitor's browser
      │
      │  opens a WebSocket connection on page load
      ▼
WebSocket API Gateway  ──$connect route──▶  DBUpdater (Lambda)
                                                  │
                                                  ├─▶ saves connection ID
                                                  │   to ConnectionIds table
                                                  │
                                                  └─▶ increments the count
                                                      in VisitorCount table
                                                              │
                                                   this write triggers a
                                                   DynamoDB Stream event
                                                              │
                                                              ▼
                                              DBStreamProcessor (Lambda)
                                                              │
                                              looks up every open
                                              connection ID, and pushes
                                              the new count to each one
                                                              │
                                                              ▼
                                            Every open browser tab updates
                                            its displayed count, live
```

When a visitor closes the tab, the `$disconnect` route fires and `DBUpdater` just removes their connection ID — the count itself never decreases.

### What's already built for you

- `backend/template.yaml` — the WebSocket API, `ConnectionIdsTable`, `DBUpdaterFunction`, and `DBStreamProcessorFunction` are added alongside the existing REST resources (not replacing them). DynamoDB Streams is turned on for `VisitorCountTable`, which both the old and new Lambdas share.
- `backend/src/dbupdater.py` — handles `$connect`/`$disconnect`
- `backend/src/dbstreamprocessor.py` — reacts to the stream, pushes updates out
- `backend/tests/test_dbupdater.py` and `test_dbstreamprocessor.py` — new, alongside the existing `test_app.py`
- `frontend/script.js` — now supports both: it uses the WebSocket path if `WEBSOCKET_URL` is filled in, otherwise falls back to the REST path automatically. Nothing breaks if you deploy this before finishing the WebSocket setup.

### Deploy it

Same commands as before — this is still one SAM stack, just with more resources in it now:

```bash
cd backend
sam build
sam deploy
```

Since you're updating the *existing* `cloud-resume-backend` stack (not creating a new one), CloudFormation will show you a changeset that adds the new WebSocket resources without touching the REST ones — confirm it same as always.

Grab both URLs from the Outputs section afterward:
```
ApiUrl:        https://abcd123456.execute-api.us-east-1.amazonaws.com/prod/count
WebSocketUrl:  wss://abcd123456.execute-api.us-east-1.amazonaws.com/prod
```

### Wire it into the frontend

- Open `frontend/script.js`
- If you'd already filled in a real `API_URL` from Part 3, make sure that value carries over into this version of the file — it's still there and still used as the fallback
- Leave `WEBSOCKET_URL` as the placeholder for now — the site will keep working off the REST path automatically until you fill this in
- Re-upload to S3 and invalidate CloudFront, same as always:
  ```bash
  aws s3 sync frontend/ s3://yourname-resume-site --delete
  aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
  ```

At this point, double check the site still works exactly as it did before — it should, since nothing about the REST path changed.

### Once you're ready to actually switch over

- Paste the `WebSocketUrl` value into `WEBSOCKET_URL` in `script.js`, re-upload, invalidate the cache again
- Test it (see below)

### Test it

Open your live site in **two browser tabs side by side**. Reload one of them — the count in the *other* tab should update on its own, with no refresh needed. That's the real difference from Part 3's version: the update comes from someone else's action, pushed to you live.

### Run the tests

```bash
pip install pytest boto3 moto
cd backend
pytest tests -v
```

### Costs — this is the one part of the project with genuinely new cost dimensions

| Item | Cost |
|---|---|
| WebSocket messages | $1.00 per million, first 1M/month free for your first 12 months |
| WebSocket connection time | $0.25 per million connection-*minutes* (not messages — every minute a connection stays open counts, even idle) — first 750,000 minutes/month free for 12 months |
| DynamoDB Streams (via Lambda trigger) | **Free, no matter the volume** — AWS doesn't charge for the `GetRecords` calls Lambda makes to read a stream, unlike a stream read from anywhere else |
| `ConnectionIdsTable` (DynamoDB on-demand) | Same negligible per-request pricing as the visitor count table |
| `DBUpdaterFunction` / `DBStreamProcessorFunction` (Lambda) | Same free tier as before — 1M requests + 400,000 GB-seconds/month, indefinitely, not just 12 months |

**Realistically, at personal-site traffic:** if 100 people visit in a month and each keeps the tab open for, say, 2 minutes, that's 200 connection-minutes and maybe a few hundred messages total — nowhere close to either free-tier ceiling. This should cost **$0/month** for the traffic a portfolio resume site gets, same as everything else in this project.

**The one thing actually worth watching:** connection-minutes accumulate for *idle* time too, not just active messaging. If your site ever got shared somewhere and a lot of people left the tab open in the background for hours, that adds up faster than the message count does. Not a real risk at your current traffic, but worth knowing which number to check first if a bill ever looks larger than expected.

### Blog post angle

Since Part 7 already covers the "write a blog post" requirement, this extension gives you a good chunk of extra material for it: the REST-vs-WebSocket tradeoff, why DynamoDB Streams reads are free specifically *because* Lambda is the consumer, or the `GoneException` cleanup pattern for handling connections that vanish without a proper `$disconnect`.

### Cleanup — once you're confident the WebSocket version is solid

Leaving both versions running doesn't cost anything extra beyond a few cents (an idle Lambda and unused API Gateway route don't accrue charges just for existing) — but it's worth tidying up once you're done testing, so the project isn't carrying dead code:

- Delete `backend/src/app.py` and `backend/tests/test_app.py`
- In `template.yaml`, delete the `VisitorCountFunction` and `VisitorCountApi` resources, and the `ApiUrl` output
- In `script.js`, delete `API_URL`, `updateVisitorCountViaRest()`, and simplify `initVisitorCounter()` to just call the WebSocket path directly
- Run `sam deploy` again — the changeset will show the REST resources being removed from AWS

---

## Checklist (matches the official challenge spec)

- [ ] Resume in HTML, styled with CSS
- [ ] Static website hosted on S3
- [ ] HTTPS via CloudFront
- [ ] Custom domain via Route 53
- [ ] JS-based visitor counter
- [ ] Counter data stored in DynamoDB
- [ ] Counter served via API Gateway + Lambda (Python/boto3) — REST version in Part 3, or WebSocket + DynamoDB Streams version in Part 8
- [ ] Unit tests for the Lambda code
- [ ] Infrastructure as Code (SAM/CloudFormation) for the backend
- [ ] One GitHub repo with CI/CD (GitHub Actions) — frontend auto-deploys to S3+CloudFront, backend auto-tests and auto-deploys
- [ ] Blog post linked from the site
- [ ] AWS Cloud Practitioner cert on the resume (already done ✅)

---

## Cost reminder

Per the earlier estimate: this whole setup runs roughly **$1–2/month** (mostly the Route 53 hosted zone) plus the one-time domain registration. Set a **Billing console → Budgets** alert at $5 and $20 now, before you forget.
