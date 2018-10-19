export const DB_PROJECT = 'israfel';
export const DB_LIVE_ORDERS = 'liveOrders';
export const DB_RAW_ORDERS = 'rawOrders';
export const DB_USER_ORDERS = 'userOrders';
export const DB_STATUS = 'status';
export const DB_LIVE = 'live';
export const DB_DEV = 'dev';
export const DB_PAIR = 'pair';
export const DB_ORDER_HASH = 'orderHash';
export const DB_PRICE = 'price';
export const DB_ACCOUNT = 'account';
export const DB_PAIR_ORDERHASH = 'pairOrderHash';
export const DB_OPERATION = 'operation';
export const DB_SIDE = 'side';
export const DB_AMT = 'amount';
export const DB_SELL = 'sell';
export const DB_BUY = 'buy';
export const DB_FILLED_TAKER_ASSET_AMT = 'filledTakerAssetAmount';
export const DB_REMAINING_MAKER_ASSET_AMT = 'remainingFillableMakerAssetAmount';
export const DB_REMAINING_TAKER_ASSET_AMT = 'remainingFillableTakerAssetAmount';
export const DB_UPDATED_AT = 'updatedAt';

export const DB_SENDER_ADDR = 'senderAddress';

export const DB_MAKER_FEE = 'makerFee';
export const DB_TAKER_FEE = 'takerFee';
export const DB_MAKER_ADDR = 'makerAddress';
export const DB_TAKER_ADDR = 'takerAddress';
export const DB_MAKER_ASSET_AMT = 'makerAssetAmount';
export const DB_TAKER_ASSET_AMT = 'takerAssetAmount';
export const DB_MAKER_ASSET_DATA = 'makerAssetData';
export const DB_TAKER_ASSET_DATA = 'takerAssetData';
export const DB_SALT = 'salt';
export const DB_EXCHANGE_ADDR = 'exchangeAddress';
export const DB_FEE_RECIPIENT_ADDR = 'feeRecipientAddress';
export const DB_EXPIRATION_TIME_SECONDS = 'expirationTimeSeconds';
export const DB_SIGNATURE = 'signature';

export const DB_ORDER_OPERATION = {
	ADD: 'ADD',
	CANCEL: 'CANCEL',
	FILL: 'FILL'
};

export const DB_ORDER_MAKER_ADDR = 'makerAddress';
export const DB_ORDER_TAKER_ADDR = 'takerAddress';
export const DB_ORDER_MAKER_ASSETDATA = 'makerAssetData';
export const DB_ORDER_TAKER_ASSETDATA = 'takerAssetData';
export const DB_ORDER_IS_CANCELLED = 'isCancelled';
export const DB_ORDER_IS_VALID = 'isValid';
export const ORDER_BUY = 'buy';
export const ORDER_SELL = 'sell';
export const ORDERBOOK_UPDATE = 'orderBookUpdate';
export const ORDERBOOK_SNAPSHOT = 'orderBookSnapshot';

export const DB_ORDER_ADDED = 'added';
export const DB_ORDERS = 'orders';
export const DB_TIMESTAMP = 'timestamp';

export const AWS_DYNAMO_API_VERSION = '2012-10-08';

export const TAKER_ETH_DEPOSIT = 10;
export const ONE_SECOND_MS = 1000;
export const ONE_MINUTE_MS = ONE_SECOND_MS * 60;
export const TEN_MINUTES_MS = ONE_MINUTE_MS * 10;
export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
export const PROVIDER_INFURA_KOVAN = 'https://kovan.infura.io';
export const NETWORK_ID_KOVAN = 42;
export const PROVIDER_LOCAL = 'http://localhost:8555';
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
export const TOKEN_MAPPING: { [key: string]: string } = {
	'0x871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c': TOKEN_ZRX,
	'0x0b1ba0af832d7c05fd64161e0db78e85978e8082': TOKEN_WETH
};

export const PAIR_SEPARATOR = '-';
export const TRADING_PAIRS = [TOKEN_ZRX + PAIR_SEPARATOR + TOKEN_WETH];

export const PRUNE_INTERVAL = 3600000;
export const ORDER_WATCHER = 'orderWatcher';
export const ORDER_PRUNE = 'pruneOrder';
export const SET_ALLOWANCE = 'setAllowance';
export const START_RELAYER = 'startRelayer';

export const LOG_INFO = 'INFO';
export const LOG_DEBUG = 'DEBUG';
export const LOG_ERROR = 'ERROR';
export const LOG_RANKING: { [level: string]: number } = {
	[LOG_ERROR]: 0,
	[LOG_INFO]: 1,
	[LOG_DEBUG]: 2
};

export const DB_STS_PROCESS = 'process';
export const DB_STS_HOSTNAME = 'hostname';

export const PRICE_PRECISION = 8;
