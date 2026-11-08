// All demo data. Nothing here is real. Dates are relative to "today".
const ago = (days, h = 12, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const ahead = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export const CATEGORIES = {
  groceries: { label: 'Groceries', color: '#22c55e' },
  dining: { label: 'Cafés & dining', color: '#f97316' },
  transport: { label: 'Transport', color: '#3b82f6' },
  shopping: { label: 'Shopping', color: '#a855f7' },
  utilities: { label: 'Utilities', color: '#eab308' },
  mobile: { label: 'Mobile & internet', color: '#06b6d4' },
  health: { label: 'Health', color: '#ef4444' },
  entertainment: { label: 'Entertainment', color: '#ec4899' },
  transfers: { label: 'Transfers', color: '#64748b' },
  loans: { label: 'Loans', color: '#0ea5e9' },
  income: { label: 'Income', color: '#16a34a' },
  cashback: { label: 'Cashback', color: '#84cc16' },
  exchange: { label: 'Exchange', color: '#14b8a6' },
};

// Directory used to resolve ANY card number to a masked owner name (like real banks do).
export const CARD_DIRECTORY = {
  '4169738812214067': 'Murad A.',
  '4098551200347781': 'Rauf H.',
  '5522410099871043': 'Aysel Q.',
  '4169221055528865': 'Nigar A.',
  '5103887766543317': 'Elvin M.',
  '4169550033332210': 'Sevda H.',
};

export const seed = () => ({
  user: {
    firstName: 'Leyla', lastName: 'Hasanova', phone: '+994 50 555 12 47', email: 'leyla.h@mail.demo',
    fin: '7XK2M9Q', birth: '14.03.1994', address: 'Baku, Nasimi district', customerSince: '2019', segment: 'Premium',
  },

  accounts: [
    { id: 'acc-azn', name: 'Main account', currency: 'AZN', balance: 306.03, iban: 'AZ21CASP00000000000012345678' },
    { id: 'acc-usd', name: 'USD savings', currency: 'USD', balance: 20.0, iban: 'AZ47CASP00000000000087654321' },
  ],

  cards: [
    {
      id: 'card-debit', name: 'Caspia Debit', product: 'Visa Gold', network: 'VISA', accountId: 'acc-azn',
      number: '4169730011224471', holder: 'LEYLA HASANOVA', expiry: '09/29', cvv: '381',
      style: 'navy', frozen: false, primary: true, virtual: false,
      limits: { purchase: 2000, atm: 1000, online: 1500 }, online: true, contactless: true, abroad: true,
    },
    {
      id: 'card-taksit', name: 'Caspia Installment', product: 'Mastercard World', network: 'MASTERCARD', accountId: null,
      number: '5246880044569032', holder: 'LEYLA HASANOVA', expiry: '03/28', cvv: '904',
      style: 'violet', frozen: false, primary: false, virtual: false, creditLimit: 4000, available: 3150,
      limits: { purchase: 1000, atm: 300, online: 1000 }, online: true, contactless: true, abroad: false,
    },
    {
      id: 'card-virtual', name: 'Virtual card', product: 'Visa Virtual', network: 'VISA', accountId: 'acc-azn',
      number: '4169739988120556', holder: 'LEYLA HASANOVA', expiry: '11/27', cvv: '112',
      style: 'mint', frozen: false, primary: false, virtual: true,
      limits: { purchase: 500, atm: 0, online: 500 }, online: true, contactless: false, abroad: true,
    },
  ],

  contacts: [
    { id: 'p1', name: 'Sevda Hasanova', short: 'Mom', phone: '+994 50 210 22 10', card: '4169550033332210', color: '#f97316' },
    { id: 'p2', name: 'Rauf Hasanov', short: 'Dad', phone: '+994 55 778 17 81', card: '4098551200347781', color: '#3b82f6' },
    { id: 'p3', name: 'Murad Aliyev', short: 'Murad', phone: '+994 70 104 30 43', card: '4169738812214067', color: '#22c55e' },
    { id: 'p4', name: 'Aysel Guliyeva', short: 'Aysel', phone: '+994 51 886 58 65', card: '5522410099871043', color: '#a855f7' },
    { id: 'p5', name: 'Elvin Mammadov', short: 'Elvin', phone: '+994 77 331 73 17', card: '5103887766543317', color: '#ef4444' },
    { id: 'p6', name: 'Nigar Abbasova', short: 'Nigar', phone: '+994 50 553 05 30', card: '4169221055528865', color: '#06b6d4' },
  ],

  templates: [
    { id: 'tpl1', title: 'Rent', type: 'card', to: '4098551200347781', amount: 450, icon: 'home' },
    { id: 'tpl2', title: 'Mom monthly', type: 'card', to: '4169550033332210', amount: 100, icon: 'heart' },
    { id: 'tpl3', title: 'Electricity', type: 'bill', billerId: 'azerishiq', icon: 'zap' },
  ],

  billerGroups: [
    { id: 'mobile', title: 'Mobile', icon: 'smartphone', billers: ['azercell', 'bakcell', 'nar'] },
    { id: 'utilities', title: 'Utilities', icon: 'zap', billers: ['azerishiq', 'azersu', 'azeriqaz', 'azeristilik'] },
    { id: 'internet', title: 'Internet & TV', icon: 'wifi', billers: ['citynet', 'aztelekom', 'ktv'] },
    { id: 'gov', title: 'Government', icon: 'landmark', billers: ['fines', 'tax'] },
    { id: 'education', title: 'Education', icon: 'graduation-cap', billers: ['university', 'school'] },
    { id: 'transport', title: 'Transport', icon: 'bus', billers: ['metrocard', 'parking'] },
  ],

  billers: {
    azercell: { name: 'Azercell', field: 'Phone number', placeholder: '050 555 12 47', mode: 'topup', saved: '0505551247' },
    bakcell: { name: 'Bakcell', field: 'Phone number', placeholder: '055 000 00 00', mode: 'topup' },
    nar: { name: 'Nar', field: 'Phone number', placeholder: '070 000 00 00', mode: 'topup' },
    azerishiq: { name: 'Azərişıq', field: 'Subscriber code', placeholder: '1200457893', mode: 'debt', saved: '1200457893', debt: 23.4 },
    azersu: { name: 'Azərsu', field: 'Subscriber code', placeholder: '880341277', mode: 'debt', saved: '880341277', debt: 8.75 },
    azeriqaz: { name: 'Azəriqaz', field: 'Subscriber code', placeholder: '3304419920', mode: 'debt', saved: '3304419920', debt: 31.2 },
    azeristilik: { name: 'Azəristilik', field: 'Subscriber code', placeholder: '5500120', mode: 'debt', debt: 0 },
    citynet: { name: 'CityNet', field: 'Contract number', placeholder: 'CN-77120', mode: 'debt', saved: 'CN-77120', debt: 25.0 },
    aztelekom: { name: 'Aztelekom', field: 'Phone number', placeholder: '012 000 00 00', mode: 'debt', debt: 6.5 },
    ktv: { name: 'Cable TV', field: 'Contract number', placeholder: 'TV-0000', mode: 'debt', debt: 12 },
    fines: { name: 'Traffic fines', field: 'Car plate', placeholder: '10-AB-123', mode: 'debt', saved: '10-LH-494', debt: 40 },
    tax: { name: 'Property tax', field: 'Taxpayer ID', placeholder: '1234567890', mode: 'debt', debt: 0 },
    university: { name: 'University tuition', field: 'Student ID', placeholder: 'ST-00000', mode: 'free' },
    school: { name: 'School fees', field: 'Student ID', placeholder: 'SC-00000', mode: 'free' },
    metrocard: { name: 'Metro card', field: 'Card number', placeholder: '0000 0000', mode: 'topup' },
    parking: { name: 'City parking', field: 'Car plate', placeholder: '10-AB-123', mode: 'topup' },
  },

  transactions: [
    { id: 't01', title: 'Salary — Nova LLC', category: 'income', amount: 1850, date: ago(5, 10), cardId: 'card-debit', merchant: 'Nova LLC' },
    { id: 't02', title: 'Bravo Supermarket', category: 'groceries', amount: -64.3, date: ago(0, 19, 12), cardId: 'card-debit', cashback: 1.29 },
    { id: 't03', title: 'Bolt', category: 'transport', amount: -7.4, date: ago(0, 9, 3), cardId: 'card-debit' },
    { id: 't04', title: 'Mado Café', category: 'dining', amount: -28.5, date: ago(1, 20, 40), cardId: 'card-debit', cashback: 1.43 },
    { id: 't05', title: 'Araz Market', category: 'groceries', amount: -41.85, date: ago(2, 18), cardId: 'card-debit' },
    { id: 't06', title: 'Transfer to Sevda H.', category: 'transfers', amount: -100, date: ago(3, 11), cardId: 'card-debit' },
    { id: 't07', title: 'Zara', category: 'shopping', amount: -119, date: ago(4, 16, 22), cardId: 'card-taksit', installment: '3 months' },
    { id: 't08', title: 'Pizza Mizza', category: 'dining', amount: -22, date: ago(5, 21), cardId: 'card-debit', cashback: 1.1 },
    { id: 't09', title: 'Uber', category: 'transport', amount: -11.2, date: ago(5, 8, 30), cardId: 'card-debit' },
    { id: 't10', title: 'Zeytun Pharmacy', category: 'health', amount: -18.6, date: ago(7, 13), cardId: 'card-debit' },
    { id: 't11', title: 'Azərişıq', category: 'utilities', amount: -19.8, date: ago(9, 10), cardId: 'card-debit' },
    { id: 't12', title: 'Starbucks', category: 'dining', amount: -9.5, date: ago(10, 9, 15), cardId: 'card-debit', cashback: 0.48 },
    { id: 't13', title: 'Bravo Supermarket', category: 'groceries', amount: -87.2, date: ago(11, 18, 50), cardId: 'card-debit', cashback: 1.74 },
    { id: 't14', title: 'Azercell top-up', category: 'mobile', amount: -10, date: ago(12, 12), cardId: 'card-debit' },
    { id: 't15', title: 'Transfer from Murad A.', category: 'transfers', amount: 40, date: ago(14, 15), cardId: 'card-debit' },
    { id: 't16', title: 'Kontakt Home', category: 'shopping', amount: -85, date: ago(15, 12), cardId: 'card-taksit', installment: '12 months' },
    { id: 't17', title: 'CinemaPlus', category: 'entertainment', amount: -24, date: ago(16, 21), cardId: 'card-debit' },
    { id: 't18', title: 'Netflix', category: 'entertainment', amount: -15.99, date: ago(17, 3), cardId: 'card-virtual' },
    { id: 't19', title: 'Nargiz Restaurant', category: 'dining', amount: -54, date: ago(18, 20), cardId: 'card-debit', cashback: 2.7 },
    { id: 't20', title: 'Cash loan payment', category: 'loans', amount: -142.5, date: ago(20, 9), cardId: 'card-debit' },
    { id: 't21', title: 'Cashback payout', category: 'cashback', amount: 12.4, date: ago(22, 9), cardId: 'card-debit' },
    { id: 't22', title: 'Bolt', category: 'transport', amount: -6.1, date: ago(23, 22), cardId: 'card-debit' },
    { id: 't23', title: 'Spotify', category: 'entertainment', amount: -5.99, date: ago(25, 3), cardId: 'card-virtual' },
    { id: 't24', title: 'Bravo Supermarket', category: 'groceries', amount: -102.6, date: ago(27, 19), cardId: 'card-debit', cashback: 2.05 },
    { id: 't25', title: 'Salary — Nova LLC', category: 'income', amount: 1850, date: ago(35, 10), cardId: 'card-debit', merchant: 'Nova LLC' },
    { id: 't26', title: 'Azərsu', category: 'utilities', amount: -7.9, date: ago(38, 10), cardId: 'card-debit' },
    { id: 't27', title: 'Port Baku Mall', category: 'shopping', amount: -210, date: ago(41, 17), cardId: 'card-taksit', installment: '6 months' },
    { id: 't28', title: 'Wolt', category: 'dining', amount: -31.4, date: ago(44, 20), cardId: 'card-debit' },
  ],

  loans: [
    {
      id: 'loan1', type: 'Cash loan', amount: 3000, remaining: 1820, monthly: 142.5, rate: 14.9, term: 24, paid: 10,
      nextDate: ahead(9), startDate: ago(300),
    },
  ],

  installments: [
    { id: 'ins1', merchant: 'Kontakt Home', item: 'Robot vacuum', total: 1020, monthly: 85, paid: 3, months: 12, nextDate: ahead(12) },
    { id: 'ins2', merchant: 'Zara', item: 'Winter coat', total: 357, monthly: 119, paid: 2, months: 3, nextDate: ahead(4) },
    { id: 'ins3', merchant: 'Port Baku Mall', item: 'Headphones', total: 1260, monthly: 210, paid: 2, months: 6, nextDate: ahead(18) },
  ],

  deposits: [
    { id: 'dep1', name: 'Smart Saver', currency: 'AZN', amount: 1500, rate: 9, term: 12, opened: ago(120), maturity: ahead(245) },
  ],

  depositProducts: [
    { id: 'dp1', name: 'Smart Saver', currency: 'AZN', rates: { 6: 7.5, 12: 9, 18: 9.5 }, min: 100, note: 'Monthly interest payout' },
    { id: 'dp2', name: 'Flex Save', currency: 'AZN', rates: { 3: 5, 6: 6 }, min: 50, note: 'Top up and withdraw anytime' },
    { id: 'dp3', name: 'Dollar Deposit', currency: 'USD', rates: { 12: 2 }, min: 100, note: 'Interest at maturity' },
  ],

  cashback: { balance: 9.24, thisMonth: 10.75 },
  offers: [
    { id: 'o1', merchant: 'Bravo Supermarket', percent: 2, category: 'groceries', until: '31 Dec', active: true, note: 'On all purchases' },
    { id: 'o2', merchant: 'Mado Café', percent: 5, category: 'dining', until: '30 Nov', active: true, note: 'Weekends only' },
    { id: 'o3', merchant: 'Bolt', percent: 3, category: 'transport', until: '15 Dec', active: false, note: 'Night rides 22:00–06:00' },
    { id: 'o4', merchant: 'Zeytun Pharmacy', percent: 4, category: 'health', until: '20 Dec', active: false, note: 'All products' },
    { id: 'o5', merchant: 'CinemaPlus', percent: 10, category: 'entertainment', until: '31 Dec', active: false, note: 'Tickets & snacks' },
    { id: 'o6', merchant: 'Kontakt Home', percent: 0, category: 'shopping', until: '31 Dec', active: false, note: '0% installment for 12 months' },
  ],

  rates: [
    { code: 'USD', name: 'US Dollar', buy: 1.6985, sell: 1.7035 },
    { code: 'EUR', name: 'Euro', buy: 1.962, sell: 1.989 },
    { code: 'GBP', name: 'British Pound', buy: 2.236, sell: 2.281 },
    { code: 'RUB', name: 'Russian Ruble', buy: 0.0201, sell: 0.0218 },
    { code: 'TRY', name: 'Turkish Lira', buy: 0.0468, sell: 0.0512 },
  ],

  notifications: [
    { id: 'n1', title: 'Installment due in 4 days', body: 'Zara — 119.00 AZN on your Installment card.', date: ago(0, 9), read: false, type: 'warning' },
    { id: 'n2', title: 'Cashback credited', body: 'You earned 1.29 AZN at Bravo Supermarket.', date: ago(0, 19, 13), read: false, type: 'success' },
    { id: 'n3', title: 'New offer: CinemaPlus 10%', body: 'Activate it in Cashback before 31 Dec.', date: ago(2, 12), read: true, type: 'info' },
    { id: 'n4', title: 'New device login', body: 'iPhone 15 · Baku · if this wasn’t you, call *0000.', date: ago(6, 22), read: true, type: 'security' },
  ],

  branches: [
    { id: 'b1', name: 'Head Office', address: '28 May st. 12, Baku', hours: 'Mon–Fri 09:00–18:00', type: 'branch', distance: 1.2 },
    { id: 'b2', name: 'Ganjlik Branch', address: 'Ataturk ave. 44, Baku', hours: 'Mon–Sat 09:00–18:00', type: 'branch', distance: 2.8 },
    { id: 'b3', name: '28 Mall ATM', address: 'Azadlig ave. 15a, Baku', hours: '24/7 · cash in/out', type: 'atm', distance: 0.6 },
    { id: 'b4', name: 'Port Baku ATM', address: 'Neftchilar ave. 151, Baku', hours: '24/7 · USD/AZN', type: 'atm', distance: 3.1 },
    { id: 'b5', name: 'Sumgait Branch', address: 'Sulh st. 8, Sumgait', hours: 'Mon–Fri 09:00–18:00', type: 'branch', distance: 31 },
    { id: 'b6', name: 'Ganja Branch', address: 'Javadkhan st. 21, Ganja', hours: 'Mon–Fri 09:00–18:00', type: 'branch', distance: 360 },
  ],

  devices: [
    { id: 'dv1', name: 'This device', place: 'Baku', last: 'Now', current: true },
    { id: 'dv2', name: 'iPhone 15', place: 'Baku', last: '6 days ago', current: false },
  ],

  settings: { hideBalance: false, biometrics: true, webauthn: false, dark: false, notifications: true, language: 'English' },
});
