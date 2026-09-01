pipeline {
    agent any

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Create .env') {
            steps {
                withCredentials([
                    string(
                        credentialsId: 'hospital-env',
                        variable: 'HOSPITAL_ENV'
                    )
                ]) {
                    sh '''
                        echo "$HOSPITAL_ENV" > .env
                        chmod 600 .env
                    '''
                }
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




