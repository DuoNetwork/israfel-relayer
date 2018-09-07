import { OrderStateInvalid, OrderStateValid, SignedOrder } from '0x.js';
import { CollectionReference, DocumentReference, DocumentSnapshot } from '@google-cloud/firestore';
import * as admin from 'firebase-admin';
import * as CST from './constants';
import { IDuoOrder } from './types';
import util from './util';

class FirebaseUtil {
	private db: admin.firestore.Firestore | null = null;

	public init() {
		util.log('initialize firebase');
		const serviceAccount = require('./keys/x-dev-5a1e9-firebase-adminsdk-pdiep-5bb8187969.json');
		admin.initializeApp({
			credential: admin.credential.cert(serviceAccount),
			databaseURL: 'https://x-dev-5a1e9.firebaseio.com'
		});
		this.db = admin.firestore();
		this.db.settings({ timestampsInSnapshots: true });
	}

	private getRef(path: string): CollectionReference | DocumentReference {
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
				[CST.DB_TIMESTAMP]: admin.firestore.FieldValue.serverTimestamp()
			}),
			false
		);
	}

	public async getOrders() {
		return ((await this.getDoc(
			`/${CST.DB_ORDERS}`
		)) as DocumentSnapshot).data() as IDuoOrder[];
	}

	public async deleteOrder(orderHash: string) {
		return this.deleteDoc(`/${CST.DB_ORDERS}/${orderHash}`);
	}

	public async updateOrderState(orderState: OrderStateValid | OrderStateInvalid) {
		const { orderHash, ...rest } = orderState;
		return this.setDoc(
			`/${CST.DB_ORDERS}/${orderHash}`,
			Object.assign({}, rest, {
				[CST.DB_UPDATED_AT]: admin.firestore.FieldValue.serverTimestamp()
			}),
			true
		);
	}
}

const firebaseUtil = new FirebaseUtil();
export default firebaseUtil;
