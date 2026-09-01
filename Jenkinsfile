
pipeline {
    agent any

    stages {

        stage('Create .env') {
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
                    docker compose --env-file .env run --rm \
                    --env-file .env backend \
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






