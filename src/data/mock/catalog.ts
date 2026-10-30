/** Static master data used by the seed generator (Sri Lankan distribution business). */

export interface ProductSeed {
  name: string;
  category: string;
  uom: string;
  cost: number; // LKR
  price: number; // LKR selling price
  emoji: string;
  reorder: number;
  supplier: number; // index into SUPPLIERS
  /** stocking profile: which warehouses carry it (indexes into WAREHOUSES) */
  wh: number[];
  /** health profile used to shape seed stock */
  profile?: "low" | "out" | "over";
}

export const WAREHOUSES = [
  { code: "CMB-01", name: "Colombo Central DC", city: "Colombo", address: "214 Orugodawatta Road, Colombo 14" },
  { code: "KDY-01", name: "Kandy Regional Hub", city: "Kandy", address: "45 Industrial Zone, Peradeniya Road, Kandy" },
  { code: "GLE-01", name: "Galle Southern Depot", city: "Galle", address: "12 Karapitiya Road, Galle" },
] as const;

export const ZONES = [
  { code: "RCV", name: "Receiving & Staging", kind: "receiving" as const },
  { code: "A", name: "Dry Goods & Spices", kind: "storage" as const },
  { code: "B", name: "Beverages & Coconut", kind: "storage" as const },
  { code: "C", name: "Household & General", kind: "storage" as const },
  { code: "RTN", name: "Returns & Inspection", kind: "returns" as const },
];

export const CATEGORY_ZONE: Record<string, "A" | "B" | "C"> = {
  "Tea & Beverages": "B",
  "Spices & Condiments": "A",
  "Grains & Staples": "A",
  "Coconut Products": "B",
  "Household & Cleaning": "C",
  "Personal Care": "C",
  "Packaging Materials": "C",
  "Electronics & Accessories": "C",
};

export const SUPPLIERS = [
  { name: "Ceylon Tea Traders (Pvt) Ltd", contact: "Anura Dias", email: "orders@ceylonteatraders.lk", phone: "+94 11 245 8812", country: "Sri Lanka", address: "88 Sir Baron Jayatilaka Mw, Colombo 01", terms: "Net 30", lead: 5 },
  { name: "Spice Garden Exports", contact: "Mala Rajapaksa", email: "sales@spicegarden.lk", phone: "+94 81 223 4410", country: "Sri Lanka", address: "17 Matale Road, Kandy", terms: "Net 21", lead: 6 },
  { name: "Lanka Grain Millers", contact: "Sampath Gunawardena", email: "dispatch@lankagrain.lk", phone: "+94 25 222 7731", country: "Sri Lanka", address: "Industrial Estate, Anuradhapura", terms: "Net 30", lead: 7 },
  { name: "Coco Island Products", contact: "Priyanka Wickramasinghe", email: "hello@cocoisland.lk", phone: "+94 31 222 9054", country: "Sri Lanka", address: "Madampe Road, Chilaw", terms: "Net 14", lead: 4 },
  { name: "CleanWave Distributors", contact: "Dinesh Pathirana", email: "supply@cleanwave.lk", phone: "+94 11 258 4420", country: "Sri Lanka", address: "Ja-Ela Industrial Park, Ja-Ela", terms: "Net 30", lead: 3 },
  { name: "Serendib Packaging Ltd", contact: "Nadeeka Amarasinghe", email: "accounts@serendibpack.lk", phone: "+94 11 234 7766", country: "Sri Lanka", address: "Kelaniya Export Zone", terms: "Net 45", lead: 8 },
  { name: "TechLink Imports", contact: "Wei Lin Tan", email: "trade@techlink-imports.sg", phone: "+65 6123 4455", country: "Singapore", address: "20 Toh Guan Road, Singapore", terms: "Net 45", lead: 18 },
  { name: "PureCare Naturals", contact: "Rohit Menon", email: "export@purecarenaturals.in", phone: "+91 484 400 1290", country: "India", address: "Kakkanad, Kochi, Kerala", terms: "Net 30", lead: 14 },
] as const;

export const CUSTOMERS = [
  { name: "Lanka Fresh Supermarkets", contact: "Chaminda Ratnayake", city: "Colombo", address: "125 Galle Road, Colombo 03" },
  { name: "Island Mart Kandy", contact: "Shalini Abeysekera", city: "Kandy", address: "27 Dalada Veediya, Kandy" },
  { name: "Green Leaf Organics", contact: "Thilini Jayasinghe", city: "Galle", address: "9 Fort Main Street, Galle" },
  { name: "Harbour Café Group", contact: "Roshan De Silva", city: "Colombo", address: "Port City Promenade, Colombo 02" },
  { name: "Hill Country Grocers", contact: "Mahesh Kularatne", city: "Nuwara Eliya", address: "44 Lawson Street, Nuwara Eliya" },
  { name: "Coastline Hotels & Resorts", contact: "Anjali Peiris", city: "Bentota", address: "Galle Road, Bentota" },
  { name: "Metro Wholesale Traders", contact: "Faizal Marikar", city: "Colombo", address: "Main Street, Pettah, Colombo 11" },
  { name: "City Pharmacy Chain", contact: "Dr. Harsha Mendis", city: "Colombo", address: "310 High Level Road, Nugegoda" },
  { name: "Kandyan Bazaar", contact: "Lasantha Ekanayake", city: "Kandy", address: "Peradeniya Road, Kandy" },
  { name: "Jaffna Provision Stores", contact: "Sivakumar Rasiah", city: "Jaffna", address: "Hospital Road, Jaffna" },
  { name: "Southern Cash & Carry", contact: "Gayan Liyanage", city: "Matara", address: "Anagarika Dharmapala Mw, Matara" },
  { name: "Negombo Fisheries Cooperative", contact: "Sunil Fonseka", city: "Negombo", address: "Lewis Place, Negombo" },
] as const;

export interface UserSeed {
  name: string;
  email: string;
  phone: string;
  role: "admin" | "warehouse_manager" | "inventory_manager" | "operator";
  title: string;
  wh: number[]; // warehouse indexes
}

export const USERS: UserSeed[] = [
  { name: "Nimal Perera", email: "nimal.perera@wms.lk", phone: "+94 77 123 4501", role: "admin", title: "Operations Director", wh: [0, 1, 2] },
  { name: "Sanduni Fernando", email: "sanduni.fernando@wms.lk", phone: "+94 77 123 4502", role: "warehouse_manager", title: "Warehouse Manager — Colombo", wh: [0] },
  { name: "Kasun Wijesinghe", email: "kasun.wijesinghe@wms.lk", phone: "+94 77 123 4503", role: "warehouse_manager", title: "Warehouse Manager — Kandy", wh: [1] },
  { name: "Dilani Jayawardena", email: "dilani.jayawardena@wms.lk", phone: "+94 77 123 4504", role: "warehouse_manager", title: "Warehouse Manager — Galle", wh: [2] },
  { name: "Ruwan Silva", email: "ruwan.silva@wms.lk", phone: "+94 77 123 4505", role: "inventory_manager", title: "Inventory Control Manager", wh: [0, 1] },
  { name: "Tharindu Bandara", email: "tharindu.bandara@wms.lk", phone: "+94 77 123 4506", role: "inventory_manager", title: "Procurement & Inventory Analyst", wh: [1, 2] },
  { name: "Chamara Rathnayake", email: "chamara.rathnayake@wms.lk", phone: "+94 77 123 4507", role: "operator", title: "Picker / Packer", wh: [0] },
  { name: "Ishara Gunasekara", email: "ishara.gunasekara@wms.lk", phone: "+94 77 123 4508", role: "operator", title: "Receiving Clerk", wh: [0] },
  { name: "Nuwan Kumara", email: "nuwan.kumara@wms.lk", phone: "+94 77 123 4509", role: "operator", title: "Forklift Operator", wh: [0] },
  { name: "Shanika Herath", email: "shanika.herath@wms.lk", phone: "+94 77 123 4510", role: "operator", title: "Picker / Packer", wh: [1] },
  { name: "Lakmal Dissanayake", email: "lakmal.dissanayake@wms.lk", phone: "+94 77 123 4511", role: "operator", title: "Receiving Clerk", wh: [1] },
  { name: "Amaya Senanayake", email: "amaya.senanayake@wms.lk", phone: "+94 77 123 4512", role: "operator", title: "Picker / Packer", wh: [2] },
  { name: "Pradeep Weerasinghe", email: "pradeep.weerasinghe@wms.lk", phone: "+94 77 123 4513", role: "operator", title: "Dispatch Coordinator", wh: [2] },
  { name: "Malsha Karunaratne", email: "malsha.karunaratne@wms.lk", phone: "+94 77 123 4514", role: "operator", title: "Stock Counter", wh: [0, 1] },
];

const C = "Tea & Beverages";
const S = "Spices & Condiments";
const G = "Grains & Staples";
const K = "Coconut Products";
const H = "Household & Cleaning";
const P = "Personal Care";
const K2 = "Packaging Materials";
const E = "Electronics & Accessories";

// prettier-ignore
export const PRODUCTS: ProductSeed[] = [
  // Tea & Beverages
  { name: "Ceylon Black Tea 100g", category: C, uom: "pack", cost: 320, price: 450, emoji: "🍵", reorder: 220, supplier: 0, wh: [0, 1, 2] },
  { name: "Ceylon Green Tea Bags 25s", category: C, uom: "box", cost: 380, price: 520, emoji: "🍃", reorder: 160, supplier: 0, wh: [0, 1, 2] },
  { name: "Earl Grey Tea Tin 250g", category: C, uom: "pcs", cost: 780, price: 1050, emoji: "☕", reorder: 80, supplier: 0, wh: [0, 1], profile: "low" },
  { name: "Instant Coffee Jar 100g", category: C, uom: "pcs", cost: 890, price: 1190, emoji: "☕", reorder: 90, supplier: 0, wh: [0, 2] },
  { name: "King Coconut Water 330ml (24 pk)", category: C, uom: "carton", cost: 2400, price: 3100, emoji: "🥥", reorder: 60, supplier: 3, wh: [0, 1, 2] },
  { name: "Ginger Beer 500ml (12 pk)", category: C, uom: "carton", cost: 1650, price: 2200, emoji: "🧃", reorder: 50, supplier: 3, wh: [0, 1] },
  { name: "Cinnamon Tea Bags 20s", category: C, uom: "box", cost: 450, price: 620, emoji: "🌿", reorder: 100, supplier: 0, wh: [0, 1, 2] },
  { name: "Wood Apple Cordial 750ml", category: C, uom: "pcs", cost: 540, price: 720, emoji: "🍹", reorder: 70, supplier: 3, wh: [0, 2], profile: "over" },
  // Spices
  { name: "Ceylon Cinnamon Sticks 50g", category: S, uom: "pack", cost: 650, price: 890, emoji: "🪵", reorder: 120, supplier: 1, wh: [0, 1, 2] },
  { name: "Black Pepper Whole 100g", category: S, uom: "pack", cost: 420, price: 580, emoji: "🌶️", reorder: 140, supplier: 1, wh: [0, 1, 2] },
  { name: "Turmeric Powder 100g", category: S, uom: "pack", cost: 210, price: 295, emoji: "🧂", reorder: 180, supplier: 1, wh: [0, 1, 2] },
  { name: "Chilli Powder 250g", category: S, uom: "pack", cost: 360, price: 495, emoji: "🌶️", reorder: 160, supplier: 1, wh: [0, 1] },
  { name: "Roasted Curry Powder 250g", category: S, uom: "pack", cost: 395, price: 540, emoji: "🍛", reorder: 150, supplier: 1, wh: [0, 1, 2] },
  { name: "Cardamom Pods 50g", category: S, uom: "pack", cost: 980, price: 1290, emoji: "🌱", reorder: 60, supplier: 1, wh: [0, 2], profile: "out" },
  { name: "Whole Cloves 50g", category: S, uom: "pack", cost: 720, price: 960, emoji: "🌰", reorder: 70, supplier: 1, wh: [0, 1] },
  { name: "Maldive Fish Flakes 100g", category: S, uom: "pack", cost: 690, price: 920, emoji: "🐟", reorder: 80, supplier: 1, wh: [0, 2] },
  // Grains & Staples
  { name: "Samba Rice 5kg", category: G, uom: "bag", cost: 1450, price: 1790, emoji: "🍚", reorder: 200, supplier: 2, wh: [0, 1, 2] },
  { name: "Nadu Rice 10kg", category: G, uom: "bag", cost: 2650, price: 3180, emoji: "🍚", reorder: 150, supplier: 2, wh: [0, 1, 2] },
  { name: "Red Lentils (Dhal) 1kg", category: G, uom: "pack", cost: 340, price: 430, emoji: "🫘", reorder: 260, supplier: 2, wh: [0, 1, 2] },
  { name: "Wheat Flour 1kg", category: G, uom: "pack", cost: 215, price: 270, emoji: "🌾", reorder: 300, supplier: 2, wh: [0, 1, 2] },
  { name: "White Sugar 1kg", category: G, uom: "pack", cost: 255, price: 320, emoji: "🍬", reorder: 320, supplier: 2, wh: [0, 1, 2] },
  { name: "Iodized Salt 1kg", category: G, uom: "pack", cost: 85, price: 120, emoji: "🧂", reorder: 280, supplier: 2, wh: [0, 1, 2] },
  { name: "Chickpeas 500g", category: G, uom: "pack", cost: 290, price: 370, emoji: "🫘", reorder: 140, supplier: 2, wh: [0, 1] },
  { name: "Kurakkan Flour 500g", category: G, uom: "pack", cost: 260, price: 340, emoji: "🌾", reorder: 90, supplier: 2, wh: [0, 2], profile: "low" },
  // Coconut
  { name: "Coconut Oil 1L", category: K, uom: "ltr", cost: 780, price: 980, emoji: "🥥", reorder: 160, supplier: 3, wh: [0, 1, 2] },
  { name: "Coconut Milk Powder 300g", category: K, uom: "pack", cost: 410, price: 540, emoji: "🥛", reorder: 130, supplier: 3, wh: [0, 1, 2] },
  { name: "Desiccated Coconut 500g", category: K, uom: "pack", cost: 480, price: 630, emoji: "🥥", reorder: 100, supplier: 3, wh: [0, 1] },
  { name: "Coconut Treacle (Pol Pani) 375ml", category: K, uom: "pcs", cost: 560, price: 745, emoji: "🍯", reorder: 90, supplier: 3, wh: [0, 2] },
  { name: "Virgin Coconut Oil 500ml", category: K, uom: "pcs", cost: 1190, price: 1550, emoji: "🥥", reorder: 70, supplier: 3, wh: [0, 1, 2] },
  { name: "Coir Scrub Pads (6 pk)", category: K, uom: "pack", cost: 240, price: 330, emoji: "🧽", reorder: 110, supplier: 3, wh: [0, 1], profile: "over" },
  // Household
  { name: "Dishwash Liquid 500ml", category: H, uom: "pcs", cost: 310, price: 410, emoji: "🧴", reorder: 200, supplier: 4, wh: [0, 1, 2] },
  { name: "Laundry Detergent 1kg", category: H, uom: "pack", cost: 520, price: 690, emoji: "🧺", reorder: 170, supplier: 4, wh: [0, 1, 2] },
  { name: "Floor Cleaner 1L", category: H, uom: "ltr", cost: 410, price: 545, emoji: "🧼", reorder: 120, supplier: 4, wh: [0, 1] },
  { name: "Toilet Tissue 10 Roll Pack", category: H, uom: "pack", cost: 690, price: 890, emoji: "🧻", reorder: 180, supplier: 4, wh: [0, 1, 2] },
  { name: "Garbage Bags Large 30s", category: H, uom: "pack", cost: 320, price: 430, emoji: "🗑️", reorder: 140, supplier: 5, wh: [0, 2] },
  { name: "Bleach 1L", category: H, uom: "ltr", cost: 285, price: 380, emoji: "🧪", reorder: 90, supplier: 4, wh: [0, 1, 2], profile: "low" },
  // Personal care
  { name: "Herbal Soap Bar 100g (6 pk)", category: P, uom: "pack", cost: 540, price: 720, emoji: "🧼", reorder: 130, supplier: 7, wh: [0, 1, 2] },
  { name: "Herbal Shampoo 250ml", category: P, uom: "pcs", cost: 620, price: 830, emoji: "🧴", reorder: 110, supplier: 7, wh: [0, 1] },
  { name: "Fluoride Toothpaste 120g", category: P, uom: "pcs", cost: 245, price: 330, emoji: "🪥", reorder: 220, supplier: 7, wh: [0, 1, 2] },
  { name: "Coconut Hair Oil 200ml", category: P, uom: "pcs", cost: 360, price: 485, emoji: "💆", reorder: 100, supplier: 7, wh: [0, 2] },
  { name: "Hand Sanitizer 250ml", category: P, uom: "pcs", cost: 340, price: 460, emoji: "🧴", reorder: 120, supplier: 7, wh: [0, 1, 2] },
  // Packaging
  { name: "Corrugated Carton Medium (20 pk)", category: K2, uom: "pack", cost: 1850, price: 2400, emoji: "📦", reorder: 80, supplier: 5, wh: [0, 1, 2] },
  { name: "Bubble Wrap Roll 50m", category: K2, uom: "roll", cost: 2100, price: 2750, emoji: "🫧", reorder: 40, supplier: 5, wh: [0, 1] },
  { name: "Packing Tape 48mm (6 pk)", category: K2, uom: "pack", cost: 780, price: 1020, emoji: "🧵", reorder: 90, supplier: 5, wh: [0, 1, 2] },
  { name: "Stretch Wrap Film 500mm", category: K2, uom: "roll", cost: 1650, price: 2150, emoji: "🎞️", reorder: 60, supplier: 5, wh: [0, 2] },
  { name: "Kraft Paper Bags 1kg (100 pk)", category: K2, uom: "pack", cost: 1350, price: 1750, emoji: "🛍️", reorder: 50, supplier: 5, wh: [0, 1, 2], profile: "out" },
  // Electronics
  { name: "USB-C Charging Cable 1m", category: E, uom: "pcs", cost: 650, price: 990, emoji: "🔌", reorder: 80, supplier: 6, wh: [0, 1] },
  { name: "LED Bulb 9W (4 pk)", category: E, uom: "pack", cost: 1100, price: 1490, emoji: "💡", reorder: 90, supplier: 6, wh: [0, 1, 2] },
  { name: "Power Strip 4-Way 2m", category: E, uom: "pcs", cost: 1850, price: 2490, emoji: "🔋", reorder: 50, supplier: 6, wh: [0, 2] },
  { name: "AA Alkaline Batteries (8 pk)", category: E, uom: "pack", cost: 920, price: 1250, emoji: "🔋", reorder: 100, supplier: 6, wh: [0, 1, 2] },
  { name: "Wireless Optical Mouse", category: E, uom: "pcs", cost: 1450, price: 1990, emoji: "🖱️", reorder: 45, supplier: 6, wh: [0, 1], profile: "low" },
];
