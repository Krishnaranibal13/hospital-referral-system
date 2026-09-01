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
                printf '%s\\n' "$HOSPITAL_ENV" > .env
                chmod 600 .env

                echo "Checking environment variables..."

                grep '^MYSQL_DATABASE=' .env | sed 's/=.*/=****/'
                grep '^DATABASE_URL=' .env | sed 's/=.*/=****/'
                grep '^JWT_SECRET=' .env | sed 's/=.*/=****/'
                grep '^PORT=' .env | sed 's/=.*/=****/'
                grep '^NODE_ENV=' .env | sed 's/=.*/=****/'
                grep '^ALLOWED_ORIGINS=' .env | sed 's/=.*/=****/'
                grep '^VITE_API_URL=' .env | sed 's/=.*/=****/'
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




