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
                    '''
                }
            }
        }

        stage('Build Images') {
            steps {
                sh '''
                    docker compose build
                '''
            }
        }

        stage('Prisma Generate') {
            steps {
                sh '''
                    docker compose run --rm backend npx prisma generate
                '''
            }
        }

        stage('Database Migration') {
            steps {
                sh '''
                    docker compose run --rm backend npx prisma migrate deploy
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    docker compose up -d
                '''
            }
        }

        stage('Verify Deployment') {
            steps {
                sh '''
                    sleep 10
                    docker compose ps
                '''
            }
        }

        stage('Backend Logs') {
            steps {
                sh '''
                    docker compose logs backend --tail=30
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
