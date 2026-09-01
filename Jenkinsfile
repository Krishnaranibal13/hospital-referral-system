
pipeline {
    agent any

    stages {

        stage('Create .env') {
            steps {
                sh '''
                    echo "Copying .env file..."

                    cp /home/ubuntu/hospital-referral-system/.env .env
                    chmod 600 .env

                    echo ".env created successfully"
                '''
            }
        }

        stage('Build') {
            steps {
                sh '''
                    docker compose --env-file .env build
                '''
            }
        }

        stage('Migrate Database') {
            steps {
                sh '''
                    docker compose --env-file .env run --rm backend \
                    npx prisma migrate deploy
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

        stage('Verify') {
            steps {
                sh '''
                    sleep 10
                    docker compose --env-file .env ps
                '''
            }
        }
    }

    post {
        always {
            sh 'rm -f .env'
        }

        success {
            echo 'Hospital Referral System deployed successfully!'
        }

        failure {
            echo 'Deployment failed!'
        }
    }
}


