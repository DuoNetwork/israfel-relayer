import { CollectionReference, DocumentReference, DocumentSnapshot } from '@google-cloud/firestore';
import * as admin from 'firebase-admin';
import * as CST from './constants';
import util from './util';
import {ISignedOrder} from './types';

class FirebaseUtil {
	private db: admin.firestore.Firestore | null = null;
	private tool: string = 'tool';

	public init(tool: string) {
		util.log('initialize firebase');
		const serviceAccount = require('./keys/x-dev-5a1e9-firebase-adminsdk-pdiep-5bb8187969.json');
		admin.initializeApp({
			credential: admin.credential.cert(serviceAccount),
			databaseURL: 'https://x-dev-5a1e9.firebaseio.com'
		});
		this.db = admin.firestore();
		this.db.settings({ timestampsInSnapshots: true });
		this.tool = tool;
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

	public async addOrder(order: ISignedOrder) {
	}

	public async getOrders(makerAddr:string) {
		let query = (this.db as admin.firestore.Firestore)
            .collection(CST.DB_ORDERS)
            .where(CST.DB_TIMESTAMP, '>=', 0);;
		if (makerAddr) query = query.where(CST.DB_MAKER_ADDR, '==', makerAddr)
		query = query.orderBy(CST.DB_TIMESTAMP, 'desc');
		const result = await query.get();
		if (result.empty) return [];

		return result;
	}

}

const firebaseUtil = new FirebaseUtil();
export default firebaseUtil;
