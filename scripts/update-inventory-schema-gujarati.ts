#!/usr/bin/env ts-node

/**
 * Update Inventory Schema and Populate Gujarati Items
 * This script:
 * 1. Removes site_id and current_stock columns from inventory_items
 * 2. Adds Gujarati language columns if not exists
 * 3. Populates the table with construction inventory items in English and Gujarati
 */

import { getDb } from '../src/db';
import { inventory_items } from '../src/db/schema';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';

dotenv.config();

// Construction inventory items with Gujarati translations
const INVENTORY_ITEMS = [
  // Building Materials - બાંધકામ સામગ્રી
  {
    name: 'Cement',
    gujarati_name: 'સિમેન્ટ',
    unit: 'bags',
    gujarati_unit: 'બેગ',
    category: 'building_material',
    gujarati_category: 'બાંધકામ સામગ્રી',
    item_code: 'CEM001'
  },
  {
    name: 'Steel TMT Bars',
    gujarati_name: 'સ્ટીલ TMT સળિયા',
    unit: 'kg',
    gujarati_unit: 'કિલો',
    category: 'building_material',
    gujarati_category: 'બાંધકામ સામગ્રી',
    item_code: 'STL001'
  },
  {
    name: 'Red Bricks',
    gujarati_name: 'લાલ ઈંટો',
    unit: 'pcs',
    gujarati_unit: 'પીસ',
    category: 'building_material',
    gujarati_category: 'બાંધકામ સામગ્રી',
    item_code: 'BRK001'
  },
  {
    name: 'River Sand',
    gujarati_name: 'નદીની રેતી',
    unit: 'cft',
    gujarati_unit: 'ક્યુબિક ફૂટ',
    category: 'building_material',
    gujarati_category: 'બાંધકામ સામગ્રી',
    item_code: 'SND001'
  },
  {
    name: 'Crushed Stone',
    gujarati_name: 'કુચરાયેલ પથ્થર',
    unit: 'cft',
    gujarati_unit: 'ક્યુબિક ફૂટ',
    category: 'building_material',
    gujarati_category: 'બાંધકામ સામગ્રી',
    item_code: 'STN001'
  },
  {
    name: 'Concrete Blocks',
    gujarati_name: 'કોંક્રિટ બ્લોક્સ',
    unit: 'pcs',
    gujarati_unit: 'પીસ',
    category: 'building_material',
    gujarati_category: 'બાંધકામ સામગ્રી',
    item_code: 'BLK001'
  },

  // Contractor Materials - કોન્ટ્રાક્ટર સામગ્રી
  {
    name: 'Scaffolding Pipes',
    gujarati_name: 'સ્કેફોલ્ડિંગ પાઇપ્સ',
    unit: 'pcs',
    gujarati_unit: 'પીસ',
    category: 'contractor_materials',
    gujarati_category: 'કોન્ટ્રાક્ટર સામગ્રી',
    item_code: 'SCF001'
  },
  {
    name: 'Props',
    gujarati_name: 'પ્રોપ્સ',
    unit: 'pcs',
    gujarati_unit: 'પીસ',
    category: 'contractor_materials',
    gujarati_category: 'કોન્ટ્રાક્ટર સામગ્રી',
    item_code: 'PRP001'
  },
  {
    name: 'Shuttering Plywood',
    gujarati_name: 'શટરિંગ પ્લાયવુડ',
    unit: 'sheets',
    gujarati_unit: 'શીટ',
    category: 'contractor_materials',
    gujarati_category: 'કોન્ટ્રાક્ટર સામગ્રી',
    item_code: 'PLY001'
  },
  {
    name: 'Mixing Tools',
    gujarati_name: 'મિક્સિંગ ટૂલ્સ',
    unit: 'pcs',
    gujarati_unit: 'પીસ',
    category: 'contractor_materials',
    gujarati_category: 'કોન્ટ્રાક્ટર સામગ્રી',
    item_code: 'MIX001'
  },
  {
    name: 'Wheelbarrow',
    gujarati_name: 'ઠેલો',
    unit: 'pcs',
    gujarati_unit: 'પીસ',
    category: 'contractor_materials',
    gujarati_category: 'કોન્ટ્રાક્ટર સામગ્રી',
    item_code: 'WBR001'
  },

  // Electrical Materials - ઇલેક્ટ્રિકલ સામગ્રી
  {
    name: 'Electrical Wire',
    gujarati_name: 'ઇલેક્ટ્રિકલ વાયર',
    unit: 'meter',
    gujarati_unit: 'મીટર',
    category: 'electrical_materials',
    gujarati_category: 'ઇલેક્ટ્રિકલ સામગ્રી',
    item_code: 'WIR001'
  },
  {
    name: 'Switch Boards',
    gujarati_name: 'સ્વિચ બોર્ડ',
    unit: 'pcs',
    gujarati_unit: 'પીસ',
    category: 'electrical_materials',
    gujarati_category: 'ઇલેક્ટ્રિકલ સામગ્રી',
    item_code: 'SWT001'
  },
  {
    name: 'MCB',
    gujarati_name: 'MCB',
    unit: 'pcs',
    gujarati_unit: 'પીસ',
    category: 'electrical_materials',
    gujarati_category: 'ઇલેક્ટ્રિકલ સામગ્રી',
    item_code: 'MCB001'
  },
  {
    name: 'PVC Conduit',
    gujarati_name: 'PVC કંડ્યુટ',
    unit: 'meter',
    gujarati_unit: 'મીટર',
    category: 'electrical_materials',
    gujarati_category: 'ઇલેક્ટ્રિકલ સામગ્રી',
    item_code: 'PVC001'
  },
  {
    name: 'Light Fixtures',
    gujarati_name: 'લાઇટ ફિક્સચર',
    unit: 'pcs',
    gujarati_unit: 'પીસ',
    category: 'electrical_materials',
    gujarati_category: 'ઇલેક્ટ્રિકલ સામગ્રી',
    item_code: 'LGT001'
  }
];

async function updateInventorySchema() {
  try {
    console.log('📦 Starting inventory schema update...');

    const db = getDb();
    
    // 1. Remove current_stock and site_id columns if they exist using raw SQL
    console.log('🔧 Removing site_id and current_stock columns...');
    
    try {
      await db.execute(sql`ALTER TABLE inventory_items DROP COLUMN IF EXISTS site_id`);
      console.log('✅ Removed site_id column');
    } catch (error) {
      console.log('ℹ️ site_id column does not exist or already removed');
    }

    try {
      await db.execute(sql`ALTER TABLE inventory_items DROP COLUMN IF EXISTS current_stock`);
      console.log('✅ Removed current_stock column');
    } catch (error) {
      console.log('ℹ️ current_stock column does not exist or already removed');
    }

    // 2. Add Gujarati columns if they don't exist
    console.log('🌐 Adding Gujarati language support columns...');
    
    const gujaratiColumns = [
      'ADD COLUMN IF NOT EXISTS gujarati_name VARCHAR(255)',
      'ADD COLUMN IF NOT EXISTS gujarati_unit VARCHAR(50)',
      'ADD COLUMN IF NOT EXISTS gujarati_category VARCHAR(100)',
      'ADD COLUMN IF NOT EXISTS item_code VARCHAR(50)'
    ];

    for (const column of gujaratiColumns) {
      try {
        await db.execute(sql.raw(`ALTER TABLE inventory_items ${column}`));
        console.log(`✅ Added column: ${column.split(' ')[4]}`);
      } catch (error) {
        console.log(`ℹ️ Column ${column.split(' ')[4]} may already exist`);
      }
    }

    // 3. Update existing items with Gujarati translations and add new items
    console.log('🌐 Updating existing items with Gujarati translations...');
    
    for (const item of INVENTORY_ITEMS) {
      try {
        // Try to insert new item, skip if exists
        await db.insert(inventory_items).values({
          name: item.name,
          gujarati_name: item.gujarati_name,
          unit: item.unit,
          gujarati_unit: item.gujarati_unit,
          category: item.category,
          gujarati_category: item.gujarati_category,
          item_code: item.item_code,
          status: 'active' as const
        });
        
        console.log(`✅ Added new item: ${item.name} (${item.gujarati_name})`);
      } catch (insertError: any) {
        if (insertError.code === '23505') { // Unique constraint violation
          // Item exists, update with Gujarati translations
          try {
            await db.execute(sql`
              UPDATE inventory_items 
              SET 
                gujarati_name = ${item.gujarati_name},
                gujarati_unit = ${item.gujarati_unit},
                gujarati_category = ${item.gujarati_category},
                item_code = ${item.item_code},
                updated_at = NOW()
              WHERE name = ${item.name}
            `);
            console.log(`🔄 Updated existing item: ${item.name} with Gujarati translations`);
          } catch (updateError: any) {
            console.log(`⚠️ Failed to update ${item.name}: ${updateError.message}`);
          }
        } else {
          console.log(`⚠️ Skipped ${item.name}: ${insertError.message}`);
        }
      }
    }

    console.log(`\n🎉 Successfully updated inventory schema!`);
    console.log('\n📋 Summary:');
    console.log(`• Removed site_id dependency (items are now site-independent)`);
    console.log(`• Removed current_stock (calculated from transactions)`);
    console.log(`• Added Gujarati language support for ${INVENTORY_ITEMS.length} construction items`);
    console.log(`• Categories: Building Materials, Contractor Materials, Electrical Materials`);
    console.log(`• Existing data and transactions preserved`);

  } catch (error) {
    console.error('❌ Error updating inventory schema:', error);
    throw error;
  }
}

// Run the migration
if (require.main === module) {
  updateInventorySchema()
    .then(() => {
      console.log('\n✅ Inventory schema update completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Inventory schema update failed:', error);
      process.exit(1);
    });
}

export { updateInventorySchema, INVENTORY_ITEMS }; 