import postgres from "postgres";
import * as dotenv from "dotenv";
import path from "path";
import { generateUUID } from "../lib/utils";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function seed() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL not found");
    process.exit(1);
  }

  const client = postgres(url);
  try {
    console.log("Seeding sample data (20 customers, 15 with transactions)...");

    // 1. Get a user ID (from the first user in the DB)
    const users = await client`SELECT id FROM "User" LIMIT 1`;
    if (users.length === 0) {
      console.error("No users found. Please sign up in the app first.");
      return;
    }
    const userId = users[0].id;

    // 2. Ensure at least one product exists
    const products = await client`SELECT id FROM "Product" LIMIT 1`;
    let productId;
    if (products.length === 0) {
      productId = generateUUID();
      await client`
        INSERT INTO "Product" (id, name, price, "userId") 
        VALUES (${productId}, 'Premium Business Plan', '250', ${userId})
      `;
      console.log("Created a sample product.");
    } else {
      productId = products[0].id;
    }

    // 3. Create 20 sample customers
    const customerData = [];
    for (let i = 1; i <= 20; i++) {
       customerData.push({
         id: generateUUID(),
         name: `Customer ${i}`,
         email: `customer${i}@example.com`,
         userId: userId,
         createdAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000) // Random date in last 90 days
       });
    }

    for (const c of customerData) {
      await client`
        INSERT INTO "Customer" (id, name, email, "userId", "createdAt") 
        VALUES (${c.id}, ${c.name}, ${c.email}, ${c.userId}, ${c.createdAt})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`Inserted 20 customers.`);

    // 4. Create transactions for the first 15 customers
    let txCount = 0;
    for (let i = 0; i < 15; i++) {
      const customer = customerData[i];
      // Create 1-3 transactions per customer
      const numTx = Math.floor(Math.random() * 3) + 1;
      for (let j = 0; j < numTx; j++) {
        const amount = (Math.random() * 500 + 50).toFixed(2);
        const createdAt = new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000); // Last 30 days
        
        await client`
          INSERT INTO "Transaction" (id, "customerId", "productId", amount, "createdAt") 
          VALUES (${generateUUID()}, ${customer.id}, ${productId}, ${amount}, ${createdAt})
        `;
        txCount++;
      }
    }
    
    // Add some "inactive" transactions (for churn risk testing)
    const inactiveCustomer = customerData[14]; // The 15th customer
    await client`
      INSERT INTO "Transaction" (id, "customerId", "productId", amount, "createdAt") 
      VALUES (${generateUUID()}, ${inactiveCustomer.id}, ${productId}, '99.99', ${new Date(Date.now() - 75 * 24 * 60 * 60 * 1000)})
    `;
    txCount++;

    console.log(`Sample data seeded successfully. Total transactions created: ${txCount}`);
  } catch (error) {
    console.error("Error seeding data:", error);
  } finally {
    await client.end();
  }
}

seed();
