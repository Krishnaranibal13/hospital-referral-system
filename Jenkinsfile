
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
             
                       echo "Number of lines in .env:"
                       wc -l .env

                       echo "Variable names found:"
                       cut -d= -f1 .env
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
                    docker compose --env-file .env run --rm backend\
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






