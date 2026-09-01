pipeline {
    agent any

    environment {
        COMPOSE_PROJECT_NAME = 'hospital-referral-system'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Create Environment File') {
            steps {
                withCredentials([
                    string(
                        credentialsId: 'hospital-env',
                        variable: 'HOSPITAL_ENV'
                    )
                ]) {
                    sh '''
                        printf "%s\\n" "$HOSPITAL_ENV" > .env
                        chmod 600 .env

                        echo "Environment file created."
                        echo "Variables present:"
                        grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env | cut -d= -f1
                    '''
                }
            }
        }

        stage('Build Images') {
            steps {
                sh '''
                    docker compose --env-file .env build
                '''
            }
        }

        stage('Prisma Generate') {
            steps {
                sh '''
                    docker compose --env-file .env run --rm backend npx prisma generate
                '''
            }
        }

        stage('Database Migration') {
            steps {
                sh '''
                    docker compose --env-file .env run --rm backend npx prisma migrate deploy
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    docker compose --env-file .env up -d
                '''
            }
        }

        stage('Verify Deployment') {
            steps {
                sh '''
                    sleep 10
                    docker compose --env-file .env ps
                '''
            }
        }

        stage('Backend Logs') {
            steps {
                sh '''
                    docker compose --env-file .env logs backend --tail=30
                '''
            }
        }
    }

    post {
        success {
            echo 'Hospital Referral System deployed successfully.'
        }

        failure {
            echo 'Deployment failed. Check the Jenkins console output.'
        }

        always {
            sh '''
                rm -f .env
            '''
        }
    }
}


