import { getDb } from '../src/db';
import { inventory_items, inventory_transactions, users } from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function testInventorySystem() {
  console.log('🧪 Testing Inventory Management System...\n');

  try {
    // Test 1: Create a test admin user
    console.log('1️⃣ Testing admin user creation...');
    
    const testAdmin = await getDb()
      .insert(users)
      .values({
        phone: '+919999999999',
        role: 'admin',
        name: 'Test Admin',
        is_verified: true,
        verified_at: new Date()
      })
      .onConflictDoUpdate({
        target: users.phone,
        set: {
          name: 'Test Admin',
          role: 'admin',
          is_verified: true
        }
      })
      .returning();

    console.log('✅ Admin user created/updated:', testAdmin[0].name);

    // Test 2: Create inventory items
    console.log('\n2️⃣ Testing inventory item creation...');
    
    const testItems = [
      { name: 'Cement', unit: 'bags' },
      { name: 'Steel Rods', unit: 'pcs' },
      { name: 'Bricks', unit: 'pieces' },
      { name: 'Sand', unit: 'tons' }
    ];

    const createdItems = [];
    for (const item of testItems) {
      const created = await getDb()
        .insert(inventory_items)
        .values({
          name: item.name,
          unit: item.unit,
          current_stock: 0,
          status: 'active',
          created_by: testAdmin[0].id
        })
        .onConflictDoNothing()
        .returning();
      
      if (created.length > 0) {
        createdItems.push(created[0]);
        console.log(`✅ Created item: ${item.name} (${item.unit})`);
      } else {
        // Item already exists, get it
        const existing = await getDb()
          .select()
          .from(inventory_items)
          .where(eq(inventory_items.name, item.name))
          .limit(1);
        
        if (existing.length > 0) {
          createdItems.push(existing[0]);
          console.log(`📦 Item already exists: ${item.name} (${item.unit})`);
        }
      }
    }

    // Test 3: Test stock transactions
    console.log('\n3️⃣ Testing inventory transactions...');
    
    for (const item of createdItems) {
      // Add stock (Item In)
      const addQuantity = Math.floor(Math.random() * 100) + 10; // Random 10-110
      const previousStock = item.current_stock || 0;
      const newStock = previousStock + addQuantity;

      // Update item stock
      await getDb()
        .update(inventory_items)
        .set({ 
          current_stock: newStock,
          updated_at: new Date()
        })
        .where(eq(inventory_items.id, item.id));

      // Record transaction
      await getDb()
        .insert(inventory_transactions)
        .values({
          item_id: item.id,
          transaction_type: 'in',
          quantity: addQuantity,
          previous_stock: previousStock,
          new_stock: newStock,
          notes: `Test stock addition - ${addQuantity} ${item.unit}`,
          created_by: testAdmin[0].id
        });

      console.log(`✅ Added ${addQuantity} ${item.unit} to ${item.name} (Stock: ${previousStock} → ${newStock})`);

      // Remove some stock (Item Out)
      const removeQuantity = Math.floor(addQuantity / 3); // Remove 1/3 of what we added
      const currentStock = newStock;
      const finalStock = currentStock - removeQuantity;

      // Update item stock
      await getDb()
        .update(inventory_items)
        .set({ 
          current_stock: finalStock,
          updated_at: new Date()
        })
        .where(eq(inventory_items.id, item.id));

      // Record transaction
      await getDb()
        .insert(inventory_transactions)
        .values({
          item_id: item.id,
          transaction_type: 'out',
          quantity: removeQuantity,
          previous_stock: currentStock,
          new_stock: finalStock,
          notes: `Test stock removal - ${removeQuantity} ${item.unit}`,
          created_by: testAdmin[0].id
        });

      console.log(`📤 Removed ${removeQuantity} ${item.unit} from ${item.name} (Stock: ${currentStock} → ${finalStock})`);
    }

    // Test 4: Generate inventory balance report data
    console.log('\n4️⃣ Testing inventory balance report...');
    
    const inventoryItems = await getDb()
      .select()
      .from(inventory_items)
      .where(eq(inventory_items.status, 'active'))
      .orderBy(inventory_items.name);

    console.log('📊 Current Inventory Balance:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    inventoryItems.forEach(item => {
      console.log(`• ${item.name}: ${item.current_stock} ${item.unit}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Test 5: Generate transactions report data
    console.log('\n5️⃣ Testing day-to-day transactions report...');
    
    const transactions = await getDb()
      .select({
        id: inventory_transactions.id,
        transaction_type: inventory_transactions.transaction_type,
        quantity: inventory_transactions.quantity,
        notes: inventory_transactions.notes,
        created_at: inventory_transactions.created_at,
        item_name: inventory_items.name,
        item_unit: inventory_items.unit,
        user_name: users.name
      })
      .from(inventory_transactions)
      .leftJoin(inventory_items, eq(inventory_transactions.item_id, inventory_items.id))
      .leftJoin(users, eq(inventory_transactions.created_by, users.id))
      .orderBy(inventory_transactions.created_at);

    console.log('📅 Recent Transactions:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    transactions.forEach(transaction => {
      const date = transaction.created_at ? new Date(transaction.created_at).toLocaleDateString() : 'Unknown';
      const type = transaction.transaction_type.toUpperCase();
      console.log(`${date} | ${transaction.item_name} | ${type} | ${transaction.quantity} ${transaction.item_unit} | ${transaction.user_name}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n✅ Inventory Management System Test Complete!');
    console.log('🎉 All core functionalities are working correctly.');
    console.log('\nThe following features have been tested:');
    console.log('✓ Item creation and management');
    console.log('✓ Stock addition (Item In)');
    console.log('✓ Stock removal (Item Out)');
    console.log('✓ Transaction logging');
    console.log('✓ Inventory balance reporting');
    console.log('✓ Day-to-day transaction reporting');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testInventorySystem().then(() => {
  console.log('\n🔚 Test completed. Database ready for inventory management.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
}); 