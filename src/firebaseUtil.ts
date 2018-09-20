import { OrderStateInvalid, OrderStateValid, SignedOrder } from '0x.js';
import {
	CollectionReference,
	DocumentChange,
	DocumentReference,
	QuerySnapshot
} from '@google-cloud/firestore';
import * as admin from 'firebase-admin';
import * as CST from './constants';
import { IDuoOrder, IOrderStateCancelled } from './types';
import util from './util';

class FirebaseUtil {
	private db: admin.firestore.Firestore | null = null;

	public init() {
		util.log('initialize firebase');
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

	public async addOrder(order: SignedOrder, orderHash: string) {
		return this.setDoc(
			`/${CST.DB_ORDERS}/${orderHash}`,
			Object.assign({}, order, {
				orderHash: orderHash,
				isValid: true,
				isCancelled: false,
				[CST.DB_TIMESTAMP]: admin.firestore.FieldValue.serverTimestamp()
			}),
			false
		);
	}

	public async getOrders(): Promise<IDuoOrder[]> {
		const orders: IDuoOrder[] = [];
		const docs = (await this.getDoc(`/${CST.DB_ORDERS}`)) as QuerySnapshot;
		docs.forEach(doc => orders.push(doc.data() as IDuoOrder));
		return orders;
	}

	public async deleteOrder(orderHash: string) {
		return this.deleteDoc(`/${CST.DB_ORDERS}/${orderHash}`);
	}

	public async updateOrderState(
		orderState: OrderStateValid | OrderStateInvalid | IOrderStateCancelled
	) {
		const { orderHash, ...rest } = orderState;
		return this.setDoc(
			`/${CST.DB_ORDERS}/${orderHash}`,
			Object.assign({}, rest, {
				[CST.DB_UPDATED_AT]: admin.firestore.FieldValue.serverTimestamp()
			}),
			true
		);
	}

	public onOrderQuery(onData: (qs: QuerySnapshot) => any) {
		return (this.getRef(`/${CST.DB_ORDERS}`) as CollectionReference).onSnapshot(onData);
	}

	public onOrder() {
		return (this.getRef(`/${CST.DB_ORDERS}`) as CollectionReference).onSnapshot(
			(qs: QuerySnapshot) => {
				if (!qs.empty) qs.docChanges.map(d => this.parseOrder(d));
			}
		);
	}

	public parseOrder(change: DocumentChange): IDuoOrder {
		const data = change.doc.data();
		if (!data) throw new Error('change does not exist');
		return {
			senderAddress: data.senderAddress,
			makerAddress: data.makerAddress,
			takerAddress: data.takerAddress,
			makerFee: data.makerFee,
			takerFee: data.takerFee,
			makerAssetAmount: data.makerAssetAmount,
			takerAssetAmount: data.takerAssetAmount,
			makerAssetData: data.makerAssetData,
			takerAssetData: data.takerAssetData,
			salt: data.salt,
			exchangeAddress: data.exchangeAddress,
			feeRecipientAddress: data.feeRecipientAddress,
			expirationTimeSeconds: data.expirationTimeSeconds,
			signature: data.signature,
			orderHash: data.orderHash,
			isValid: data.isValid,
			isCancelled: data.isCancelled,
			updatedAt: data.updatedAt,
			orderWatcherState: data.orderRelevantState
		};
	}
}

const firebaseUtil = new FirebaseUtil();
export default firebaseUtil;
