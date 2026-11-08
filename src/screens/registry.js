// Screens added in later builds register here (merged into the route table in index.jsx).
import Transfers, { ToCard, ByPhone, OwnAccounts, Abroad, RequestMoney, ReceiptScreen } from './Transfers.jsx';
import Payments, { BillerGroup, PayBiller, QR } from './Payments.jsx';
import Cards, { CardDetail, OrderCard } from './Cards.jsx';
import More, { Notifications, Profile, Security, Settings, Branches, Support } from './Account.jsx';
import { Loans, LoanApply, Deposits, NewDeposit, Cashback, Exchange } from './Products.jsx';

export default [
  ['/transfers', Transfers],
  ['/transfers/card', ToCard],
  ['/transfers/phone', ByPhone],
  ['/transfers/own', OwnAccounts],
  ['/transfers/abroad', Abroad],
  ['/transfers/request', RequestMoney],
  ['/receipt/:id', ReceiptScreen],
  ['/payments', Payments],
  ['/payments/group/:id', BillerGroup],
  ['/payments/:id', PayBiller],
  ['/qr', QR],
  ['/cards', Cards],
  ['/cards/new', OrderCard],
  ['/cards/:id', CardDetail],
  ['/loans', Loans],
  ['/loans/apply', LoanApply],
  ['/deposits', Deposits],
  ['/deposits/new', NewDeposit],
  ['/cashback', Cashback],
  ['/exchange', Exchange],
  ['/more', More],
  ['/notifications', Notifications],
  ['/profile', Profile],
  ['/security', Security],
  ['/settings', Settings],
  ['/branches', Branches],
  ['/support', Support],
];
