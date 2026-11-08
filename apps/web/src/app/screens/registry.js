// Screens added in later builds register here (merged into the route table in index.jsx).
import Transfers, { ToCard, ByPhone, OwnAccounts, Abroad, RequestMoney, ReceiptScreen } from './Transfers.jsx';
import Payments, { BillerGroup, PayBiller, QR } from './Payments.jsx';
import Cards, { CardDetail, OrderCard } from './Cards.jsx';
import More, { Notifications, Profile, Security, Settings, Branches, Support } from './Account.jsx';
import Bills from './Bills.tsx';
import Subscriptions from './Subscriptions.tsx';
import CardReplace from './CardReplace.tsx';
import RecurringTransfer from './RecurringTransfer.tsx';
import SplitBill from './SplitBill.tsx';
import TemplateTransfer from './TemplateTransfer.tsx';
import TransferContact from './TransferContact.tsx';
import { Portfolio, Market } from './Invest.tsx';
import { Instrument, OrderForm } from './InvestOrder.tsx';
import { Loans, LoanApply, Deposits, NewDeposit, Cashback, Exchange } from './Products.jsx';

export default [
  // design/* screens (UI_CONTRACT section 2). core-screens wins where both define a route.
  ['/bills', Bills],
  ['/subscriptions', Subscriptions],
  ['/cards/:id/replace', CardReplace],
  ['/transfers/recurring', RecurringTransfer],
  ['/transfers/template/:id', TemplateTransfer],
  ['/transfers/contact', TransferContact],
  ['/split/:txId', SplitBill],
  ['/invest', Portfolio],
  ['/invest/market', Market],
  ['/invest/order', OrderForm],
  ['/invest/:symbol', Instrument],
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
