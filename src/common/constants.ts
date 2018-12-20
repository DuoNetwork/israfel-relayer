export const DB_ISRAFEL = 'israfel';
export const DB_LIVE_ORDERS = 'liveOrders';
export const DB_RAW_ORDERS = 'rawOrders';
export const DB_USER_ORDERS = 'userOrders';
export const DB_SEQUENCE = 'sequence';
export const DB_STATUS = 'status';
export const DB_LIVE = 'live';
export const DB_DEV = 'dev';
export const DB_PAIR = 'pair';
export const DB_INITIAL_SEQ = 'initialSequence';
export const DB_CURRENT_SEQ = 'currentSequence';
export const DB_ORDER_HASH = 'orderHash';
export const DB_PRICE = 'price';
export const DB_ACCOUNT = 'account';
export const DB_ACCOUNT_YM = 'accountYearMonth';
export const DB_PAIR_OH_SEQ_STATUS = 'pairOrderHashSequenceStatus';
export const DB_TYPE = 'type';
export const DB_CONFIRMED = 'confirmed';
export const DB_MATCHING = 'matching';
export const DB_USER = 'user';
export const DB_ORDER_PROCESSOR = 'orderProcessor';
export const DB_ORDER_MATCHER = 'orderMatcher';
export const DB_ORDER_WATCHER = 'orderWatcher';
export const DB_RELAYER = 'relayer';
export const NODE = 'node';
export const DB_URL = 'url';
export const DB_SIDE = 'side';
export const DB_LEFT = 'left';
export const DB_RIGHT = 'right';
export const DB_ASK = 'ask';
export const DB_BID = 'bid';
export const DB_BALANCE = 'balance';
export const DB_AMOUNT = 'amount';
export const DB_FILL = 'fill';
export const DB_PFILL = 'pFill';
export const DB_CREATED_AT = 'createdAt';
export const DB_UPDATED_AT = 'updatedAt';
export const DB_UPDATED_BY = 'updatedBy';
export const DB_PROCESSED = 'processed';
export const DB_TOKENS = 'tokens';
export const DB_ADDRESS = 'address';
export const DB_CODE = 'code';
export const DB_EXP = 'expiry';
export const DB_DENOMINATION = 'denomination';
export const DB_PRECISIONS = 'precisions';
export const DB_FEE = 'fee';
export const DB_FEE_SCHEDULES = 'feeSchedules';
export const DB_FEE_ASSET = 'feeAsset';
export const DB_MIN = 'minimum';
export const DB_ASSET = 'asset';
export const DB_RATE = 'rate';
export const DB_MATURITY = 'maturity';
export const DB_CUSTODIAN = 'custodian';
export const DB_MATCH = 'match';
export const DB_TX_HASH = 'transactionHash';

export const DB_ADD = 'add';
export const DB_UPDATE = 'update';
export const DB_TERMINATE = 'terminate';

export const DB_PROCESS = 'process';
export const DB_HOSTNAME = 'hostname';
export const DB_COUNT = 'count';

export const DB_0X_SENDER_ADDR = 'senderAddress';
export const DB_0X_MAKER_FEE = 'makerFee';
export const DB_0X_TAKER_FEE = 'takerFee';
export const DB_0X_MAKER_ADDR = 'makerAddress';
export const DB_0X_TAKER_ADDR = 'takerAddress';
export const DB_0X_MAKER_ASSET_AMT = 'makerAssetAmount';
export const DB_0X_TAKER_ASSET_AMT = 'takerAssetAmount';
export const DB_0X_MAKER_ASSET_DATA = 'makerAssetData';
export const DB_0X_TAKER_ASSET_DATA = 'takerAssetData';
export const DB_0X_SALT = 'salt';
export const DB_0X_EXCHANGE_ADDR = 'exchangeAddress';
export const DB_0X_FEE_RECIPIENT_ADDR = 'feeRecipientAddress';
export const DB_0X_EXPIRATION_TIME_SECONDS = 'expirationTimeSeconds';
export const DB_0X_SIGNATURE = 'signature';

export const DB_ORDERS = 'orders';
export const DB_ORDER_BOOKS = 'orderBooks';
export const DB_QUEUE = 'queue';
export const DB_CACHE = 'cache';
export const DB_PUBSUB = 'pubsub';
export const DB_SNAPSHOT = 'snapshot';

export const AWS_DYNAMO_API_VERSION = '2012-10-08';

export const TAKER_ETH_DEPOSIT = 10; // for development only
export const ONE_SECOND_MS = 1000;
export const ONE_MINUTE_MS = ONE_SECOND_MS * 60;
export const TEN_MINUTES_MS = ONE_MINUTE_MS * 10;
export const RELAYER_ADDR_KOVAN = '0x003519A4aB2C35c59Cb31d9194A45DD3F9Bf9e32';
export const RELAYER_ADDR_MAIN = '0x003519A4aB2C35c59Cb31d9194A45DD3F9Bf9e32';
export const DUMMY_ADDR = '0x0000000000000000000000000000000000000000';
export const PROVIDER_INFURA_KOVAN = 'https://kovan.infura.io';
export const PROVIDER_INFURA_MAIN = 'https://mainnet.infura.io';
export const NETWORK_ID_MAIN = 1;
export const NETWORK_ID_KOVAN = 42;
export const PROVIDER_LOCAL = 'http://localhost:8545';
export const NETWORK_ID_LOCAL = 50;
export const PENDING_HOURS = 24;

export const WS_HISTORY = 'history';
export const WS_INFO = 'info';
export const WS_SUB = 'subscribe';
export const WS_UNSUB = 'unsubscribe';
export const WS_CHANNEL = 'channel';
export const WS_METHOD = 'method';
export const WS_INVALID_REQ = 'invalid request';
export const WS_INVALID_ORDER = 'invalid order';
export const WS_ERROR = 'error';
export const WS_OK = 'ok';
export const WS_SERVICE_NA = 'service not available';
export const WS_MATURED_TOKEN = 'matured token';
export const WS_INVALID_EXP = 'invalid expiry';
export const WS_INVALID_AMT = 'invalid amount';
export const WS_INVALID_PX = 'invalid price';

export const WS_CHANNEL_ORDERBOOK = 'orderbook';
export const WS_TYPE_ORDERBOOK = 'subscribe';
export const WS_CHANNEL_ORDER = 'order';
export const WS_TYPE_ORDER_UPDATE = 'update';
export const WS_TYPE_ORDER_ADD = 'add';
export const WS_TYPE_ORDER_CANCEL = 'cancel';

export const TOKEN_WETH = 'WETH';

export const PRUNE_INTERVAL = 3600000;
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

export const PRICE_PRECISION = 8;

export const BASE_DERIVATION_PATH = `44'/60'/0'/0`;

export const TERMINATE_SIGN_MSG =
	'By signing this message, your are confirming to cancel this order (no gas cost involved): ';
