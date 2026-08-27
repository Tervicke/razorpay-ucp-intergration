import type { Product } from "./types";
const p=(id:string,handle:string,title:string,description:string,category:string,price:number,color:string,tags:string[]):Product=>({id,handle,title,description,category,currency:"INR",imageUrl:`/products/${handle}.svg`,color,tags,variants:["S","M","L","XL"].map((size,i)=>({id:`${id}_${size.toLowerCase()}`,sku:`TV-${id.slice(-2).toUpperCase()}-${size}`,price,availableQuantity:i===3?4:10,options:{Size:size,Color:color}}))});
export const seedProducts:Product[]=[
 p("prod_01","oversized-black-t-shirt","Oversized Black T-Shirt","A heavyweight 240 GSM cotton tee with a relaxed drop-shoulder fit.","T-Shirts",99900,"Black",["oversized","casual","heavyweight"]),
 p("prod_02","brown-relaxed-shirt","Brown Relaxed Shirt","Soft twill shirt cut roomy for all-day layering.","Shirts",149900,"Brown",["relaxed","layering"]),
 p("prod_03","beige-cargo-pants","Beige Cargo Pants","Utility cargos with six pockets and an adjustable hem.","Pants",189900,"Beige",["cargo","utility"]),
 p("prod_04","black-cargo-pants","Black Cargo Pants","Tapered utility trousers made for everyday movement.","Pants",199900,"Black",["cargo","streetwear"]),
 p("prod_05","navy-oversized-hoodie","Navy Oversized Hoodie","Dense brushed fleece with a generous hood and clean finish.","Hoodies",249900,"Navy",["oversized","fleece","winter"]),
 p("prod_06","white-heavyweight-tee","White Heavyweight Tee","Structured premium cotton tee that holds its shape.","T-Shirts",109900,"White",["heavyweight","essential"]),
 p("prod_07","olive-boxy-overshirt","Olive Boxy Overshirt","A sturdy cotton overshirt with a modern cropped proportion.","Shirts",169900,"Olive",["boxy","layering"]),
 p("prod_08","grey-sweatpants","Grey Relaxed Sweatpants","Loopback cotton joggers with a straight relaxed leg.","Pants",159900,"Grey",["relaxed","loungewear"])
];
