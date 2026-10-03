/** Transport and token verification configuration shared by every module. */
export interface Config {
 transport:'http';host:string;port:number;
 publicUrl:string;issuer:string;audience:string;jwksUrl:string;scopes:string[];allowedSubjects:string[];
}
