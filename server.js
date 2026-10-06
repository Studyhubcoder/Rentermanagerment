import express from 'express';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoClient } from 'mongodb';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, pbkdf2Sync } from 'node:crypto';

dotenv.config();
const app = express();
app.use(express.json({limit:'12mb'}));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname,'public')));
const PORT=Number(process.env.PORT||3000);
const URI=process.env.MONGODB_URI;
const DB_NAME=process.env.MONGODB_DB||'rent_manager';
const JWT_SECRET=process.env.JWT_SECRET;
if(!URI||!JWT_SECRET){console.error('Missing MONGODB_URI or JWT_SECRET in .env');process.exit(1)}
const client=new MongoClient(URI);
await client.connect();
const db=client.db(DB_NAME);
const states=db.collection('app_states');
const seed={version:10,settings:{theme:'system',name:'My Property'},users:[],tenants:[],bills:[],payments:[],deletedTenants:[]};
let stateDoc=await states.findOne({_id:'main'});
if(!stateDoc){await states.insertOne({_id:'main',data:seed,updatedAt:new Date()});stateDoc={data:seed}}

function tokenFor(payload){return jwt.sign(payload,JWT_SECRET,{expiresIn:'30d'})}
function auth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))throw Error();req.auth=jwt.verify(h.slice(7),JWT_SECRET);next()}catch{res.status(401).json({error:'Unauthorized'})}}
function getState(){return states.findOne({_id:'main'}).then(x=>x?.data||structuredClone(seed))}
function publicState(s,role,tenantId){
  if(role==='landlord') return s;
  const t=s.tenants.find(x=>x.id===tenantId);
  if(!t)return {...seed,settings:s.settings,tenants:[],bills:[],payments:[],deletedTenants:[],users:[]};
  const bills=s.bills.filter(b=>b.tenantId===tenantId);
  const payments=s.payments.filter(p=>p.tenantId===tenantId||bills.some(b=>b.id===p.billId));
  return {...seed,version:s.version,settings:s.settings,tenants:[t],bills,payments,deletedTenants:[]};
}
async function writeState(s){s.version=10;await states.updateOne({_id:'main'},{$set:{data:s,updatedAt:new Date()}},{upsert:true})}

app.post('/api/auth/register-landlord',async(req,res)=>{
  try{const {name,email,password}=req.body||{};if(!name||!email||typeof password!=='string'||password.length<8)return res.status(400).json({error:'Name, email and an 8+ character password are required.'});const s=await getState();if(s.users.some(u=>u.role==='landlord'&&u.email.toLowerCase()===email.toLowerCase()))return res.status(409).json({error:'Email already exists.'});const u={id:randomUUID(),name:String(name).trim(),email:String(email).trim(),passwordHash:await bcrypt.hash(password,12),role:'landlord',createdAt:new Date().toISOString()};s.users.push(u);await writeState(s);const token=tokenFor({role:'landlord',userId:u.id});res.json({token,role:'landlord',userId:u.id,state:publicState(s,'landlord')})}catch(e){res.status(500).json({error:'Server error'})}}
);
app.post('/api/auth/login-landlord',async(req,res)=>{
  try{const {email,password}=req.body||{};const s=await getState();const u=s.users.find(x=>x.role==='landlord'&&x.email.toLowerCase()===String(email||'').toLowerCase());if(!u)return res.status(401).json({error:'Landlord account not found.'});const ok=await bcrypt.compare(String(password||''),u.passwordHash);if(!ok)return res.status(401).json({error:'Incorrect password.'});const token=tokenFor({role:'landlord',userId:u.id});res.json({token,role:'landlord',userId:u.id,state:publicState(s,'landlord')})}catch{res.status(500).json({error:'Server error'})}}
);
function renterHash(password,salt){return pbkdf2Sync(String(password),Buffer.from(salt,'hex'),210000,32,'sha256').toString('hex')}
app.post('/api/auth/login-renter',async(req,res)=>{
  try{const {email,password}=req.body||{};const s=await getState();const t=s.tenants.find(x=>x.renterEmail&&x.renterEmail.toLowerCase()===String(email||'').toLowerCase());if(!t||!t.renterPasswordHash)return res.status(401).json({error:'Renter account not found.'});const ok=renterHash(password,t.renterSalt)===t.renterPasswordHash;if(!ok)return res.status(401).json({error:'Incorrect password.'});const token=tokenFor({role:'renter',tenantId:t.id});res.json({token,role:'renter',tenantId:t.id,state:publicState(s,'renter',t.id)})}catch{res.status(500).json({error:'Server error'})}}
);
app.get('/api/state',auth,async(req,res)=>{const s=await getState();res.json({state:publicState(s,req.auth.role,req.auth.tenantId)})});
app.put('/api/state',auth,async(req,res)=>{if(req.auth.role!=='landlord')return res.status(403).json({error:'Landlord access required.'});const incoming=req.body?.state;if(!incoming||!Array.isArray(incoming.tenants)||!Array.isArray(incoming.bills)||!Array.isArray(incoming.payments))return res.status(400).json({error:'Invalid state.'});const s=await getState();incoming.users=s.users;incoming.version=10;await writeState(incoming);res.json({ok:true})});
app.post('/api/renter/check',auth,async(req,res)=>{if(req.auth.role!=='renter')return res.status(403).json({error:'Renter access required.'});const s=await getState();res.json({state:publicState(s,'renter',req.auth.tenantId)})});
app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`Rent Manager running on http://localhost:${PORT}`));
