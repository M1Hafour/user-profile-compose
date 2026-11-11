// CI/CD for the K3s deployment.
// Jenkins agent requirements: Git, Node.js 20+, Docker CLI/daemon, curl, ssh, scp.
// Jenkins credentials:
//   dockerhub-creds : Username with password (Docker Hub access token recommended)
//   k3s-master-ssh : SSH Username with private key for the Ubuntu K3s master (username: ubuntu)
// Docker Hub repositories must be PUBLIC for this starter pipeline (cluster pull secret is not configured yet).

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    environment {
        DOCKERHUB_API_IMAGE = 'user-profile-api'
        DOCKERHUB_FRONTEND_IMAGE = 'user-profile-frontend'
        K3S_MASTER_HOST = '51.21.242.54'
        K3S_MASTER_USER = 'ubuntu'
        REMOTE_K8S_DIR = '/tmp/user-profile-k8s'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.IMAGE_TAG = sh(returnStdout: true, script: 'git rev-parse --short=7 HEAD').trim()
                }
            }
        }

        stage('Install & Test Backend') {
            steps {
                dir('backend') {
                    sh 'npm ci'
                    sh 'npm test'
                }
            }
            post {
                always {
                    junit testResults: 'backend/junit.xml', allowEmptyResults: true
                    archiveArtifacts artifacts: 'backend/coverage/**', allowEmptyArchive: true
                }
            }
        }

        stage('Lint Backend') {
            steps {
                dir('backend') {
                    sh 'npx eslint .'
                }
            }
        }

        stage('Build & Push Docker Images') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DOCKERHUB_USER', passwordVariable: 'DOCKERHUB_TOKEN')]) {
                    sh '''#!/bin/sh
                        set -eu
                        echo "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USER" --password-stdin
                        docker build -t "$DOCKERHUB_USER/$DOCKERHUB_API_IMAGE:$IMAGE_TAG" -f backend/Dockerfile backend
                        docker build -t "$DOCKERHUB_USER/$DOCKERHUB_FRONTEND_IMAGE:$IMAGE_TAG" -f nginx/Dockerfile .
                        docker push "$DOCKERHUB_USER/$DOCKERHUB_API_IMAGE:$IMAGE_TAG"
                        docker push "$DOCKERHUB_USER/$DOCKERHUB_FRONTEND_IMAGE:$IMAGE_TAG"
                        docker logout
                    '''
                }
            }
        }

        stage('Deploy to K3s') {
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'k3s-master-ssh', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_CREDENTIAL_USER')]) {
                    withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DOCKERHUB_USER', passwordVariable: 'DOCKERHUB_TOKEN')]) {
                        sh '''#!/bin/sh
                            set -eu
                            if [ "$SSH_CREDENTIAL_USER" != "$K3S_MASTER_USER" ]; then
                                echo "The aws-ssh-key Jenkins credential username must be ubuntu for this Ubuntu master."
                                exit 1
                            fi

                            rm -rf k8s-rendered
                            mkdir -p k8s-rendered
                            cp k8s/*.yaml k8s-rendered/
                            sed -i "s|__DOCKERHUB_USER__|$DOCKERHUB_USER|g; s|__IMAGE_TAG__|$IMAGE_TAG|g" k8s-rendered/*.yaml

                            SSH_OPTS="-i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new"
                            ssh $SSH_OPTS "$K3S_MASTER_USER@$K3S_MASTER_HOST" "mkdir -p $REMOTE_K8S_DIR"
                            scp $SSH_OPTS -r k8s-rendered/. "$K3S_MASTER_USER@$K3S_MASTER_HOST:$REMOTE_K8S_DIR/"
                            ssh $SSH_OPTS "$K3S_MASTER_USER@$K3S_MASTER_HOST" \
                              "sudo kubectl apply -f $REMOTE_K8S_DIR/ && sudo kubectl rollout status deployment/user-profile-backend -n user-profile --timeout=180s && sudo kubectl rollout status deployment/user-profile-frontend -n user-profile --timeout=180s"
                        '''
                    }
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'k3s-master-ssh', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_CREDENTIAL_USER')]) {
                    sh '''#!/bin/sh
                        set -eu
                        ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
                          "$K3S_MASTER_USER@$K3S_MASTER_HOST" \
                          "sudo kubectl get pods,svc,ingress -n user-profile -o wide"
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "User Profile images deployed to K3s. Image tag: ${env.IMAGE_TAG}"
        }
        failure {
            echo 'Pipeline failed. Check the stage logs; the previous running image is not deliberately removed by this pipeline.'
        }
    }
}
