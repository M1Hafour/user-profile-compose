# Run the app on one server with Docker Compose

Everything runs in three containers on one server: nginx (the public entry point), the
Node.js API, and MongoDB. Only ports 80 and 443 are open to the internet. HTTPS is optional
and set up by hand (part 8). Automatic deploys from Jenkins are in part 9.

Commands are for **Amazon Linux 2023** (login user `ec2-user`). On Ubuntu, install Docker
and the Compose plugin with the official Docker instructions; the rest is the same.

---

## 1. Create the server

EC2 → Launch instance:

- **Type:** t3.small or larger (MongoDB and the app need some memory; t3.micro can be too small).
- **OS:** Amazon Linux 2023. **Key pair:** create one and keep the `.pem` file.
- **Network:** a public subnet, **Auto-assign public IP: Enable**. Allocate an **Elastic IP** and associate it with the instance, so the address does not change.
- **Storage:** 16 GiB or more.
- **Security group** (new one, for example `sg-app`):

| Type | Port | Source |
|---|---|---|
| HTTP | 80 | Anywhere-IPv4 |
| HTTPS | 443 | Anywhere-IPv4 (needed only for part 8) |
| SSH | 22 | My IP (and the public IP of the machine that runs Jenkins, for part 9) |

Nothing else is opened. MongoDB (27017) and the API (3000) are not reachable from outside.

## 2. Install Docker and Docker Compose

Log in to the server:

```bash
ssh -i ~/Downloads/your-key.pem ec2-user@<Elastic IP>
```

Install Docker:

```bash
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
```

Log out and log in again (so the `docker` group applies), then install the Compose plugin:

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker --version
docker compose version
```

On an ARM instance (t4g, m7g, and so on), use `docker-compose-linux-aarch64` instead.

## 3. Get the project onto the server

Clone the repository into `~/user-profile-app`. That folder name is what Jenkins uses in part 9.

```bash
git clone <your repository URL> ~/user-profile-app
cd ~/user-profile-app
```

If the repository is private, the server needs read access first: create a key on the server
(`ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""`), add `~/.ssh/deploy_key.pub` to the
repository as a read-only **deploy key**, and tell git to use it (`~/.ssh/config` with
`Host github.com` and `IdentityFile ~/.ssh/deploy_key`). Jenkins needs this too, because
its deploys run `git fetch` on the server.

Copying the folder with `scp` also works for a first try, but Jenkins deploys need the git clone.

## 4. Set the passwords

```bash
cd ~/user-profile-app
cp .env.example .env
nano .env
```

Set `MONGO_USERNAME`, a long `MONGO_PASSWORD`, and `MONGO_DB` if you want another name. Save and exit.

**Do this before the first start.** The database user is created the first time the
database starts. Changing `.env` later does not change the password of an existing
database (see the troubleshooting table).

## 5. Start everything

```bash
docker compose up -d --build
```

The first start downloads the images and builds the API, so it takes a few minutes. Check:

```bash
docker compose ps
```

All three services should show `running`, and `app` should become `healthy` after about
30 seconds. Then:

```bash
curl -s http://localhost/health
```

You should see `{"status":"ok","mongo":"connected",...}`.

Open `http://<Elastic IP>` in your browser. Add a user, then reload the page: the user is still there.

## 6. Everyday use

| Task | Command |
|---|---|
| Show the status | `docker compose ps` |
| Watch the API logs | `docker compose logs -f app` |
| Watch nginx logs | `docker compose logs -f nginx` |
| Restart one service | `docker compose restart app` |
| Stop everything (keeps the data) | `docker compose down` |
| Start again | `docker compose up -d` |
| Deploy a new version by hand | `git pull`, then `docker compose up -d --build` (with Jenkins, part 9 does this on each build) |
| Reload nginx after changing `nginx/default.conf` | `docker compose restart nginx` (nginx reads its config only at start) |

The containers restart by themselves after a server reboot (`restart: unless-stopped`) as
long as Docker itself is enabled (step 2 did that).

**Warning:** `docker compose down -v` also deletes the database volume, which removes all users.
Use it only if you want to erase everything.

Backups are not set up in this project. Plan them yourself (for example, a copy of the
`mongo-data` volume) before you put real data in it.

## 7. Check that it works

From your computer:

```bash
curl -sI http://<Elastic IP>/                 # 200 OK
curl -s  http://<Elastic IP>/health           # "mongo":"connected"
curl -s  http://<Elastic IP>/api/users        # JSON list (empty at first: [])
```

The API and the database must NOT answer from outside. From your computer, this should
fail or time out (that is correct):

```bash
curl -m 5 http://<Elastic IP>:3000/health
```

---

## 8. HTTPS with a DuckDNS name (optional, by hand)

HTTPS needs a domain name, because certificates are issued for names, not IP addresses.
A free DuckDNS name works, and Let's Encrypt certificates are free. Nothing here is
automatic: you request the certificate, copy it, and turn on the HTTPS config yourself.
The certificate files and `nginx/https.conf` are not in git, so Jenkins deploys do not overwrite them.

Below, replace `<name>` with your DuckDNS subdomain (for example `myuserapp`).

1. **Check the name.** On duckdns.org, the subdomain's IP must be the Elastic IP. From your
   computer, `nslookup <name>.duckdns.org` must show the Elastic IP.

2. **Free ports 80 and 443.** Only one program can listen on them. If an older web server or
   certificate timer runs on this server (from an earlier setup), stop it:

   ```bash
   sudo systemctl disable --now nginx || true
   sudo systemctl disable --now certbot-renew.timer || true
   sudo ss -ltnp | grep -E ':(80|443) ' || echo "ports 80 and 443 are free"
   ```

   Port 443 must also be open in the security group (step 1).

3. **Get a certificate.**

   a) If the server already has one from an earlier setup, check how long it is valid:

   ```bash
   sudo openssl x509 -enddate -noout -in /etc/letsencrypt/live/<name>.duckdns.org/fullchain.pem
   ```

   If the date is more than 30 days away, skip to step 4.

   b) Otherwise, install certbot once (skip this if `/opt/certbot/bin/certbot` already exists):

   ```bash
   sudo python3 -m venv /opt/certbot
   sudo /opt/certbot/bin/pip install certbot
   sudo ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot
   ```

   Stop the nginx container for a moment (certbot needs port 80 for its check), then request the certificate:

   ```bash
   cd ~/user-profile-app
   docker compose stop nginx || true
   sudo certbot certonly --standalone --cert-name <name>.duckdns.org -d <name>.duckdns.org \
     --force-renewal -m you@example.com --agree-tos --no-eff-email
   ```

4. **Copy the certificate into `certs/`.** `-L` copies the real file, because the `live/` folder holds links:

   ```bash
   cd ~/user-profile-app
   sudo cp -L /etc/letsencrypt/live/<name>.duckdns.org/fullchain.pem certs/
   sudo cp -L /etc/letsencrypt/live/<name>.duckdns.org/privkey.pem certs/
   sudo chown ec2-user:ec2-user certs/fullchain.pem certs/privkey.pem
   ```

5. **Create the HTTPS config.** It goes in `nginx/https.conf`, which git ignores, and it gets your name in both `server_name` lines:

   ```bash
   cp nginx/https.conf.example nginx/https.conf
   sed -i 's/YOUR-NAME.example.com/<name>.duckdns.org/g' nginx/https.conf
   grep server_name nginx/https.conf
   ```

   The `grep` must show your name on both lines.

6. **Turn it on.** Add this line to the end of `.env` (`nano .env`):

   ```
   NGINX_CONF=./nginx/https.conf
   ```

   Or with one command: `grep -q '^NGINX_CONF=' .env || echo 'NGINX_CONF=./nginx/https.conf' >> .env`

   Then start the stack again, so nginx gets the HTTPS config and the certificate:

   ```bash
   docker compose up -d
   docker compose ps
   ```

7. **Check it.** From your computer:

   ```bash
   curl -sI http://<name>.duckdns.org/ | head -n 3    # 301, Location: https://<name>.duckdns.org/
   curl -sI https://<name>.duckdns.org/ | head -n 1   # HTTP/2 200
   curl -s  https://<name>.duckdns.org/health         # "mongo":"connected"
   ```

   Open `https://<name>.duckdns.org` in the browser: there should be a padlock. Use the name,
   not the IP address. The certificate covers only the name, so the IP address shows a warning.

**Renewal is manual.** Certificates last 90 days. Set a calendar reminder for every 60 days,
then repeat steps 3b and 4, and run `docker compose up -d`. If the reminder is ignored, the
certificate expires and browsers show a warning.

**Back to plain HTTP:** remove the `NGINX_CONF` line from `.env`, then run `docker compose up -d`.

---

## 9. Automatic deploys with Jenkins (optional)

Jenkins runs on your own computer. On each build it tests the code, scans the backend image,
connects to the server over SSH, checks out the tested commit, runs `docker compose up -d --build`,
checks the public address, and posts the result to the Slack channel `#jenkins`.

**Before the first build**

1. The server has the repository in `~/user-profile-app` (part 3), a `.env` file (part 4), and the stack was started once (part 5).
2. The security group allows SSH (22) from the public IP of the Jenkins machine.
3. The Jenkins machine has Node.js 20, Docker with the Compose plugin, `trivy`, `curl`, `ssh` and `git`.
4. In Jenkins: **Manage Jenkins → Credentials → Add credentials**. Kind: *SSH Username with private key*.
   ID: `aws-ssh-key`. Username: `ec2-user`. Private key: *Enter directly*, paste the contents of the `.pem` file.
5. Open `Jenkinsfile` and check the settings at the top: `DEPLOY_HOST` (the Elastic IP) and
   `PUBLIC_URL`. Until part 8 is done, use `http://<Elastic IP>`. After it, use `https://<name>.duckdns.org`.
6. Optional: open `<your Jenkins URL>/pipeline-model-converter/` and paste the Jenkinsfile to check its syntax.
7. Create the job: **New Item → Pipeline**. Under *Pipeline*, choose *Pipeline script from SCM*,
   set your repository and branch, and *Script Path* `Jenkinsfile`. Save, then **Build Now**.

**What a deploy does not touch:** `.env` (passwords), `certs/` and `nginx/https.conf` are not
tracked by git, and the deploy's `git reset --hard` leaves untracked files alone. The database
is in the `mongo-data` volume and is kept.

**Important:** Jenkins deploys the commit it built. Commit and push your changes first. Any
uncommitted change to a tracked file on the server is overwritten by the deploy.

---

## Troubleshooting

| Symptom | What to check |
|---|---|
| `docker compose up` stops with *set MONGO_USERNAME in .env* | The `.env` file is missing or empty: `cp .env.example .env`, then fill it in. |
| Browser cannot connect to `http://<Elastic IP>` | The security group must allow HTTP 80 from Anywhere. Check `docker compose ps` shows `nginx` as running. |
| `502 Bad Gateway` on `/api` or `/health` | The API container is not running or not healthy. `docker compose ps`, then `docker compose logs app`. |
| `app` logs say *MongoDB not ready* again and again | Normal for the first minute. If it keeps going for several minutes, check `docker compose logs mongodb`. |
| `app` logs say *Authentication failed* | The password in `.env` does not match the database. The user is created only on the first start with an empty volume. Either set the old password back in `.env`, or erase the data and start again (`docker compose down -v`, which deletes all users). |
| Changed `nginx/default.conf`, but nothing changed | `docker compose restart nginx`. nginx reads its config only at start. |
| Changed `NGINX_CONF` in `.env`, but nothing changed | `docker compose up -d`, so nginx is recreated with the other config file. |
| `nginx/https.conf` became a folder | `NGINX_CONF` pointed to a file that did not exist yet, so Docker created an empty folder. Run `rm -r nginx/https.conf`, create the file (part 8, step 5), then `docker compose up -d`. |
| Port 80 or 443 already in use | Another web server runs on the host. Part 8, step 2 shows what it is and stops it. |
| Build fails at `npm ci` | Run `npm install` in `backend/` on your computer once, commit the updated `package-lock.json`, and build again. |
| After part 8 the browser says the connection is not private | You used the IP address, or the name does not match the certificate. Use `https://` with the exact name. |
| Renewal reminder ignored; the browser warns about the certificate | The certificate has expired. Repeat part 8, steps 3b and 4, then `docker compose up -d`. |
| Jenkins: *git fetch* asks for a password or says *Permission denied* | The server cannot read the repository. Set up the deploy key from part 3. |
| Jenkins: *Permission denied (publickey)* | The credential's username or private key is wrong, or the Jenkins machine's IP is not allowed on port 22. |
| Jenkins: *Verification FAILED* | Check `PUBLIC_URL` at the top of the Jenkinsfile (http before part 8, https after). The console shows the server commands to run. |
| Jenkins: *trivy* stops the build | The image has HIGH or CRITICAL vulnerabilities. Update the base image in `backend/Dockerfile` or the packages that have a fix. |
