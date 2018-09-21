export const DB_ORDERS = 'orders';
export const DB_MAKER_ADDR = 'makerAddr';
export const DB_TIMESTAMP = 'timestamp';
export const DB_UPDATED_AT = 'updatedAt';
export const DB_ORDER_ADDED = 'added';
export const DB_ORDER_MAKER_ADDR = 'makerAddress';
export const DB_ORDER_TAKER_ADDR = 'takerAddress';
export const DB_ORDER_IS_CANCELLED = 'isCancelled';
export const DB_ORDER_IS_VALID = 'isValid';
export const ORDER_BUY = 'buy';
export const ORDER_SELL = 'sell';
export const ORDERBOOK_UPDATE = 'orderBookUpdate';

export const ONE_SECOND_MS = 1000;
export const ONE_MINUTE_MS = ONE_SECOND_MS * 60;
export const TEN_MINUTES_MS = ONE_MINUTE_MS * 10;
export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
export const PROVIDER_INFURA_KOVAN = 'https://kovan.infura.io';
export const NETWORK_ID_KOVAN = 42;
export const PROVIDER_LOCAL = 'http://localhost:8545';
export const NETWORK_ID_LOCAL = 50;
export const RELAYER_HTTP_URL = 'http://localhost:3000/v0';
export const RELAYER_WS_URL = 'ws://localhost:8080';
export const MNEMONIC =
	'concert load couple harbor equip island argue ramp clarify fence smart topic';
export const BASE_DERIVATION_PATH = `44'/60'/0'/0`;
export const PENDING_HOURS = 24;

export const WS_CHANNEL_ORDERBOOK = 'orerbook';
export const WS_TYPE_ORDERBOOK = 'subscribe';
export const WS_CHANNEL_ORDER = 'order';
export const WS_TYPE_ORDER_UPDATE = 'update';
export const WS_TYPE_ORDER_ADD = 'add';
export const WS_TYPE_ORDER_CANCEL = 'cancel';

export const TOKEN_ZRX = 'ZRX';
export const TOKEN_WETH = 'WETH';
export const TOKEN_MAPPING: {[key: string]: string} = {
	'0x871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c': TOKEN_ZRX,
	'0x0b1ba0af832d7c05fd64161e0db78e85978e8082': TOKEN_WETH
};

export const PRUNE_INTERVAL = 3600000;

export const CMD_MODIFY_STATE = 'modifyState';
