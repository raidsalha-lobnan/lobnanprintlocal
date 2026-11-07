const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
const config = require("./firebase-applet-config.json");

async function test() {
  const app = initializeApp(config);
  const db = getFirestore(app);
  try {
    const snap = await getDocs(collection(db, "invoices"));
    console.log("SUCCESS: Invoices found: " + snap.size);
    process.exit(0);
  } catch (e) {
    console.error("ERROR: " + e.code + " " + e.message);
    process.exit(1);
  }
}
test();
