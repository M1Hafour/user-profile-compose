// Jenkinsfile for the one-server Docker Compose setup (GUIDE.md, part 9).
//
// Jenkins runs on your own computer. For each build it:
//   1. tests and scans the code and the backend image,
//   2. connects to the server over SSH, checks out the commit it tested,
//      and runs `docker compose up -d --build` there,
//   3. checks the public address.
//
// On the Jenkins machine: Node.js 20, Docker (with the Compose plugin), trivy, curl, ssh, git.
// In Jenkins: the credential 'aws-ssh-key' (SSH Username with private key, username ec2-user),
// and the Slack plugin with a workspace that can post to #jenkins.

pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '3'))
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        // ---- Server settings ----
        DEPLOY_HOST = '56.228.81.47'                  // Elastic IP of the server
        DEPLOY_DIR  = 'user-profile-app'                // folder in ec2-user's home directory on the server
        // The address Verify checks. Until the certificate is installed (GUIDE.md, part 8),
        // use 'http://56.228.81.47'. Afterwards use the https name.
        PUBLIC_URL  = 'https://myuserapp.duckdns.org'

        // ---- Local image: built on this machine only so it can be scanned. Nothing is pushed. ----
        IMAGE       = 'user-profile-backend'
        IMAGE_TAG   = "${env.GIT_COMMIT.take(7)}"
    }

    stages {

        stage('Install') {
            steps {
                dir('backend') {
                    // Exact install from package-lock.json. If it fails with "not in sync",
                    // run `npm install` in backend/ once on your computer, commit the lock file, and rebuild.
                    sh 'npm ci'
                }
            }
        }

        stage('Test & Coverage') {
            steps {
                dir('backend') {
                    // Jest writes backend/coverage/ and backend/junit.xml (see backend/jest.config.js).
                    sh 'npm test'
                }
            }
            post {
                always {
                    junit testResults: 'backend/junit.xml', allowEmptyResults: true
                    archiveArtifacts artifacts: 'backend/coverage/**',allowEmptyArchive: true
                }
            }
        }

        stage('Code Scan (ESLint)') {
            steps {
                dir('backend') {
                    // Non-blocking for now. Remove `|| true` once lint errors should stop the build.
                    sh 'npx eslint . || true'
                }
            }
        }

        stage('Dependency Audit') {
            steps {
                dir('backend') {
                    sh 'npm audit --audit-level=high || true'
                }
            }
        }

        stage('Build Image') {
            steps {
                // The server builds the same Dockerfile again during the deploy.
                sh 'docker build -t "$IMAGE:$IMAGE_TAG" backend'
            }
        }

        stage('Docker Image Scan') {
            steps {
                // Blocking: fails the build on HIGH or CRITICAL vulnerabilities in the image.
                sh 'trivy image --timeout 15m --severity HIGH,CRITICAL --exit-code 1 "$IMAGE:$IMAGE_TAG"'
            }
        }

        stage('Check Compose File') {
            steps {
                // Catches YAML and variable mistakes before the server is touched.
                sh 'MONGO_USERNAME=check MONGO_PASSWORD=check docker compose config --quiet'
            }
        }

        stage('Deploy to Server') {
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'aws-ssh-key', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
                    sh '''
                        set -eu

                        if [ -z "$GIT_COMMIT" ]; then
                            echo "GIT_COMMIT is empty: run this job from a Git checkout."
                            exit 1
                        fi

                        # Trust the server's key the first time; refuse it if it ever changes.
                        KNOWN_HOSTS="${JENKINS_HOME:-$HOME}/aws_known_hosts"
                        ssh_run() {
                            ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$KNOWN_HOSTS" "$@"
                        }

                        # On the server: check out exactly the commit that was tested, then rebuild and start.
                        # nginx is restarted too, because it reads its config only at start.
                        # .env, certs/ and nginx/https.conf are not tracked by git, so the reset leaves them alone.
                        ssh_run "$SSH_USER@$DEPLOY_HOST" "cd ~/$DEPLOY_DIR && git fetch --quiet origin && git reset --hard $GIT_COMMIT && docker compose up -d --build && docker compose restart nginx && docker compose ps"
                    '''
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                sh '''
                    set -u

                    # Checks the site the way a visitor reaches it. After a restart the app can take
                    # about a minute to connect to MongoDB, so keep retrying for a few minutes.
                    site_ok() { curl -fsS --max-time 10 "$PUBLIC_URL/" | grep -q "User Profile App"; }
                    api_ok()  { curl -fsS --max-time 10 "$PUBLIC_URL/health" | grep -q '"mongo":"connected"'; }

                    for i in $(seq 1 30); do
                        if site_ok && api_ok; then
                            echo "OK: $PUBLIC_URL serves the page and the backend is connected to MongoDB."
                            exit 0
                        fi
                        echo "Not ready yet (attempt $i of 30)..."
                        sleep 5
                    done

                    echo "FAILED: $PUBLIC_URL did not answer correctly."
                    echo "If HTTPS is not set up yet, set PUBLIC_URL at the top of this Jenkinsfile to http://$DEPLOY_HOST."
                    echo "On the server: cd ~/$DEPLOY_DIR && docker compose ps && docker compose logs --tail 50 app nginx"
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            slackSend(
                channel: '#jenkins',
                color: 'good',
                message: "✅ *${env.JOB_NAME}* build #${env.BUILD_NUMBER} deployed to ${env.PUBLIC_URL}."
            )
        }
        failure {
            slackSend(
                channel: '#jenkins',
                color: 'danger',
                message: "❌ *${env.JOB_NAME}* build #${env.BUILD_NUMBER} failed.\n<${env.BUILD_URL}|View console output>"
            )
        }
    }
}
