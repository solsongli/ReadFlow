import { schedule } from '../../src/features/flashcards/domain/model.js';
export function flashcardMock() {
  let cards=[],decks=[],logs=[];
  return {
    cards:()=>cards,
    route:async(route)=>{
      const url=new URL(route.request().url());
      const match=url.pathname.match(/\/workbench\/(flashcards|decks|card-reviews)(?:\/([^/]+))?(\/review)?$/);
      if(!match)return false;
      const [,kind,id,review]=match, method=route.request().method();
      const body=['POST','PATCH'].includes(method)?route.request().postDataJSON():{};
      let value;
      if(method==='GET') value={items:kind==='decks'?decks:kind==='card-reviews'?logs:cards};
      else if(kind==='decks') {
        value={...body,id:'deck-'+decks.length};decks.push(value);
      } else if(review) {
        const card=cards.find(c=>c.id===id);
        logs.push({card_id:id,previous:JSON.stringify(card),rating:body.rating});
        Object.assign(card,schedule(card,body.rating),{version:card.version+1,due:body.rating===1?body.day:'2099-01-01'});
        value=card;
      } else if(method==='POST') {
        const key = s => s.toLowerCase().replace(/[‐‑–—-]/g, " ").replace(/\s+/g, " ").trim();
        const prior = body.kind === 'term' && cards.find(c => c.item_id === body.item_id && c.kind === 'term' && key(c.front) === key(body.front));
        if (prior) { await route.fulfill({ json: { ...prior, duplicate: true } }); return true; }
        value={interval:0,repetitions:0,ease:2.5,due:'0001-01-01',version:0,suspended:false,
          item_title:'Paper a',...body,id:'card-'+cards.length}; cards.push(value);
      } else if(method==='PATCH') {
        value=cards.find(c=>c.id===id);Object.assign(value,body);
      } else cards=cards.filter(c=>c.id!==id);
      await route.fulfill(value?{json:value}:{status:204});
      return true;
    },
    detach(id,policy){
      const refs=cards.filter(c=>c.annotation_id===id);
      if(refs.length&&!policy)return false;
      if(policy==='remove')cards=cards.filter(c=>c.annotation_id!==id);
      else for(const card of refs)Object.assign(card,{annotation_id:null,orphaned:true});
      return true;
    },
  };
}
