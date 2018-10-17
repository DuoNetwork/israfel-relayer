import { OrderStateInvalid, OrderStateValid } from '0x.js';
import { CollectionReference, DocumentReference, QuerySnapshot } from '@google-cloud/firestore';
import * as admin from 'firebase-admin';
import * as CST from './constants';
import { IDuoOrder, IDuoSignedOrder, IOrderStateCancelled } from './types';
import util from './util';

class FirebaseUtil {
	private db: admin.firestore.Firestore | null = null;

	public init() {
		util.logInfo('initialize firebase');
		const serviceAccount = require('./keys/duo-dev-f64ce-firebase-adminsdk-gu930-519c00a624.json');
		admin.initializeApp({
			credential: admin.credential.cert(serviceAccount),
			databaseURL: 'https://duo-dev-f64ce.firebaseio.com'
		});
		this.db = admin.firestore();
		this.db.settings({ timestampsInSnapshots: true });
	}

	public getRef(path: string): CollectionReference | DocumentReference {
		const parts = ((path.startsWith('/') ? '' : '/') + path).split('/').filter(p => !!p.trim());
		let dbRef: any = this.db;
		parts.forEach((p, i) => {
			dbRef = i % 2 ? dbRef.doc(p) : dbRef.collection(p);
		});
		return dbRef;
	}

	public async getDoc(path: string) {
		return this.getRef(path).get();
	}

	public isExistRef(orderHash: string) {
		return (this.getRef(`/${CST.DB_ORDERS}/${orderHash}`) as DocumentReference) ? true : false;
	}

	public async setDoc(path: string, updates: object, merge: boolean = true) {
		return (this.getRef(path) as DocumentReference).set(updates, { merge: merge });
	}

	public async deleteDoc(path: string) {
		return (this.getRef(path) as DocumentReference).delete();
	}

	public async addOrder(order: IDuoSignedOrder, orderHash: string, marketId: string) {
		return this.setDoc(
			`/${CST.DB_ORDERS + '|' + marketId}/${orderHash}`,
			Object.assign({}, order, {
				orderHash: orderHash,
				price: Number((util.stringToBN(order.makerAssetAmount).div(util.stringToBN(order.takerAssetAmount)))),
				isValid: true,
				isCancelled: false,
				orderRelevantState: {
					filledTakerAssetAmount: '0',
					remainingFillableMakerAssetAmount: order.makerAssetAmount,
					remainingFillableTakerAssetAmount: order.takerAssetAmount
				},
				[CST.DB_UPDATED_AT]: admin.firestore.FieldValue.serverTimestamp()
			}),
			false
		);
	}
	public querySnapshotToDuo(qs: QuerySnapshot): IDuoOrder[] {
		return qs.docs.map(doc => doc.data() as IDuoOrder);
	}

	public async getOrders(marketId: string, address?: string): Promise<IDuoOrder[]> {
		let query = (this.getRef(`/${CST.DB_ORDERS}|${marketId}`) as CollectionReference)
			.where(CST.DB_ORDER_IS_CANCELLED, '==', false)
			.where(CST.DB_ORDER_IS_VALID, '==', true);

		if (address) query = query.where(CST.DB_ORDER_MAKER_ADDR, '==', address);
		query = query.orderBy(CST.DB_UPDATED_AT, 'desc');
		const result = await query.get();
		if (result.empty) return [];
		return this.querySnapshotToDuo(result);
	}

	// public async getOrderBook(
	// 	marketId: string
	// ): Promise<IOrderBook> {
	// 	return this.querySnapshotToDuo(
	// 		await (this.getRef(`/${CST.DB_ORDERS}|${marketId}`) as CollectionReference)
	// 			// .where(CST.DB_ORDER_MAKER_ASSETDATA, '==', quoteAssetData)
	// 			// .where(CST.DB_ORDER_TAKER_ASSETDATA, '==', baseAssetData)
	// 			.where(CST.DB_ORDER_IS_CANCELLED, '==', false)
	// 			.where(CST.DB_ORDER_IS_VALID, '==', true)
	// 			.get()
	// 	);

	// }

	// public async getOrdersByAddress(address: string): Promise<IDuoOrder[]> {
	// 	const result = await (this.getRef(`/${CST.DB_ORDERS}`) as CollectionReference)
	// 		.where(CST.DB_ORDER_MAKER_ADDR, '==', address)
	// 		.where(CST.DB_ORDER_IS_CANCELLED, '==', false)
	// 		.where(CST.DB_ORDER_IS_VALID, '==', true)
	// 		.orderBy(CST.DB_UPDATED_AT, 'desc')
	// 		.get();

	// 	if (result.empty) return [];

	// 	return this.querySnapshotToDuo(result);
	// }

	public async deleteOrder(orderHash: string) {
		return this.deleteDoc(`/${CST.DB_ORDERS}/${orderHash}`);
	}

	public async updateOrderState(
		orderState: OrderStateValid | OrderStateInvalid | IOrderStateCancelled,
		marketId: string
	) {
		const { orderHash, ...rest } = orderState;
		return this.setDoc(
			`/${CST.DB_ORDERS}|${marketId}/${orderHash}`,
			Object.assign({}, rest, {
				[CST.DB_UPDATED_AT]: admin.firestore.FieldValue.serverTimestamp()
			})
		);
	}

	public onOrder() {
		return (this.getRef(`/${CST.DB_ORDERS}`) as CollectionReference).onSnapshot(
			(qs: QuerySnapshot) => {
				if (!qs.empty) qs.docs.map(d => d.data() as IDuoOrder);
			}
		);
	}

	// public parseOrder(change: DocumentChange): IDuoOrder {
	// 	const data = change.doc.data();
	// 	if (!data) throw new Error('change does not exist');
	// 	return {
	// 		senderAddress: data.senderAddress,
	// 		makerAddress: data.makerAddress,
	// 		takerAddress: data.takerAddress,
	// 		makerFee: data.makerFee,
	// 		takerFee: data.takerFee,
	// 		makerAssetAmount: data.makerAssetAmount,
	// 		takerAssetAmount: data.takerAssetAmount,
	// 		makerAssetData: data.makerAssetData,
	// 		takerAssetData: data.takerAssetData,
	// 		salt: data.salt,
	// 		exchangeAddress: data.exchangeAddress,
	// 		feeRecipientAddress: data.feeRecipientAddress,
	// 		expirationTimeSeconds: data.expirationTimeSeconds,
	// 		signature: data.signature,
	// 		orderHash: data.orderHash,
	// 		isValid: data.isValid,
	// 		isCancelled: data.isCancelled,
	// 		updatedAt: data.updatedAt,
	// 		orderWatcherState: data.orderRelevantState
	// 	};
	// }
}

const firebaseUtil = new FirebaseUtil();
export default firebaseUtil;
