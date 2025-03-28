/* global use, db */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

const database = '';

// The current database to use.
use(database);

async function deleteRecordsInBatches(collection) {
  try {

    // Define the filter for the records to delete
    // $in -> array me domain name honge unko delete kar dega only.
    // $nin -> array me domain name honge unko delete *nahi karega.
    const filter = {
      domainName: {
        $in: [
        ]
      }
    };

    let totalDeleted = 0, remainingDelete = 0;

    // Define the batch size
    const batchSize = 5000; // Adjust batch size as needed

    // Find the total number of records matching the query
    let totalRecords = await collection.countDocuments(filter);
    console.log(`Total records to delete: ${totalRecords} in ${collection.getName()} collection.`);

    remainingDelete = totalRecords;

    while (true) {
      // Fetch a batch of documents that match the filter
      const docs = await collection.find(filter).limit(batchSize).toArray();

      if (docs.length === 0) {
        // Break if no more documents match the filter
        break;
      }

      // Extract _id values from the fetched documents
      const idsToDelete = docs.map(doc => doc._id);

      // Delete the documents in the current batch
      const result = await collection.deleteMany({ _id: { $in: idsToDelete } });

      // Increment total deleted count
      totalDeleted += result.deletedCount;
      remainingDelete -= result.deletedCount;

      console.log(`Deleted ${result.deletedCount} records in this batch for ${collection.getName()} collection.`);

      console.log(`Remaining ${remainingDelete} records to be delete in this batch for ${collection.getName()} collection.`);

    }

    console.log(`Total records deleted: ${totalDeleted} in ${collection.getName()} collection.`);
  } catch (error) {
    console.error("Error during deletion:", error);
  }
}

const dbs = [
  db.lotus_bets,
  db.lotus_calculated_exposures,
  db.lotus_exposures,
  db.universal_casino_bets,
  db.universal_casino_calculated_exposures,
  db.universal_casino_exposures,
]

const promises = dbs.map(data => deleteRecordsInBatches(data));

Promise.all(promises)
  .then(() => console.log('All records deleted successfully'))
  .catch((error) => console.error('Error:', error));

// Total 123343
// delete 119691
// Non delete 3652