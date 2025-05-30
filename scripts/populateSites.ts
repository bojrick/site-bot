import 'dotenv/config';
import { getDb } from '../src/db';
import { sites } from '../src/db/schema';

async function populateSites() {
  const db = getDb();
  
  const sitesToInsert = [
    {
      id: '11111111-1111-1111-1111-111111111111', // Fixed UUID for site_1
      name: 'સાઈટ A - રહેઠાણ',
      location: 'મુખ્ય રહેઠાણ પ્રોજેક્ટ, અમદાવાદ',
      status: 'active' as const,
      details: {
        project_type: 'residential',
        display_id: 'site_1',
        description: 'મુખ્ય રહેઠાણ પ્રોજેક્ટ'
      }
    },
    {
      id: '22222222-2222-2222-2222-222222222222', // Fixed UUID for site_2
      name: 'સાઈટ B - વાણિજ્યિક',
      location: 'ઓફિસ કોમ્પ્લેક્સ પ્રોજેક્ટ, સુરત',
      status: 'active' as const,
      details: {
        project_type: 'commercial',
        display_id: 'site_2',
        description: 'ઓફિસ કોમ્પ્લેક્સ પ્રોજેક્ટ'
      }
    },
    {
      id: '33333333-3333-3333-3333-333333333333', // Fixed UUID for site_3
      name: 'સાઈટ C - રિટેલ',
      location: 'શોપિંગ સેન્ટર પ્રોજેક્ટ, વડોદરા',
      status: 'active' as const,
      details: {
        project_type: 'retail',
        display_id: 'site_3',
        description: 'શોપિંગ સેન્ટર પ્રોજેક્ટ'
      }
    }
  ];

  try {
    // Insert sites with fixed UUIDs
    await db.insert(sites).values(sitesToInsert).onConflictDoNothing();
    
    console.log('✅ Sites populated successfully!');
    console.log('Site IDs:');
    sitesToInsert.forEach(site => {
      console.log(`${site.details.display_id}: ${site.id}`);
    });

  } catch (error) {
    console.error('Error populating sites:', error);
  }

  process.exit(0);
}

populateSites(); 