/** Contracts only: no credential store is implemented or selected here. */
export interface StoredCredential { readonly ownerId:string; readonly encryptedValue:Uint8Array; readonly version:number }
export interface CredentialStore {
 read(ownerId:string):Promise<StoredCredential|undefined>;
 replace(credential:StoredCredential):Promise<void>;
 revoke(ownerId:string):Promise<void>;
}
