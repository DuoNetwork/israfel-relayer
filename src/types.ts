export interface IOrder {
	exchangeContractAddress: string;
	maker: string;
	taker: string;
	feeRecipient: string;
	senderAddress: string;
	makerTokenAddress: string;
	takerTokenAdress: string;
	makerFee: string;
	takerFee: string;
	expirationUnixTimestampSec: string;
	salt: string;
	makerTokenAmount: string;
	takerTokenAmount: string;
}

export interface ISignedOrder extends IOrder {
	ecSignature: string;
}
