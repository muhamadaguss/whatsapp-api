#!/bin/bash

echo "🚀 Starting PostgreSQL database..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker-compose.yml exists
if [ ! -f "../docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found in parent directory"
    exit 1
fi

# Start only the postgres service
echo "📦 Starting PostgreSQL container..."
cd ..
docker-compose up -d postgres

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Check if database is healthy
echo "🔍 Checking database health..."
for i in {1..30}; do
    if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo "✅ Database is ready!"
        break
    fi
    
    if [ $i -eq 30 ]; then
        echo "❌ Database failed to start after 30 attempts"
        docker-compose logs postgres
        exit 1
    fi
    
    echo "⏳ Attempt $i/30 - waiting for database..."
    sleep 2
done

# Show database status
echo ""
echo "📊 Database Status:"
docker-compose ps postgres

echo ""
echo "🎉 PostgreSQL is now running!"
echo "📋 Connection details:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: whatsapp_blast"
echo "   User: postgres"
echo ""
echo "🔧 Next steps:"
echo "   1. Run migrations: cd whatsapp && node run-migration.js"
echo "   2. Update existing data: node update-existing-contacts.js"
echo "   3. Test connection: node check-database.js"