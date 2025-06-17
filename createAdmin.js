const mongodb = require('mongodb');
const crypto = require('crypto');

async function createAdmin() {
    try {
        const client = new mongodb.MongoClient('mongodb+srv://khaled:12class34@cluster0.6hhnfdx.mongodb.net/');
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        const db = client.db('CMS_db');
        const users = db.collection('Users');
        
        // Remove existing admin
        await users.deleteMany({ UserType: 'admin' });
        console.log('✅ Removed existing admin users');

        // Create new admin with password 'admin123'
        const adminPassword = 'admin123';
        let hash = crypto.createHash('sha256');
        hash.update(adminPassword);
        let hashedPassword = hash.digest('hex');
        
        await users.insertOne({
            UserName: 'admin',
            Email: 'admin@cms.com',
            Password: hashedPassword,
            UserType: 'admin',
            Active: true,
            CreatedAt: new Date()
        });
        
        console.log('✅ New admin user created');
        console.log('Username: admin');
        console.log('Password: admin123');
        console.log('Hash:', hashedPassword);
        
        await client.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

createAdmin();
