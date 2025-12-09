 const dotenv = require('dotenv')
 const express = require('express');
 const app = express()
 const cors = require('cors');
 require('dotenv').config();
 const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
 const stripe = require('stripe')(process.env.STRIPE_SEC);
const port = process.env.PORT || 3000

const admin = require("firebase-admin");

const serviceAccount = require("./ticket-bari-firebase-adminsdk.json");
const verifyJwt = async(req ,res, next)=>{
  const token = req.headers.authorization.split(' ')[1]
  console.log(token)
  if(!token){
    return res.status(401).send({message:"unauthorized access"})
  }
  try{
const decoded = await admin.auth().verifyIdToken(token)
req.tokenEmail = decoded.email
console.log(decoded)
next()
  }
  catch(err){
 return res.status(401).send({message:"unauthorized access"})
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


// middleWare
app.use(cors())
app.use(express.json())
const uri = 'mongodb+srv://ticketBari:OQtQUfqntX2kahIM@cluster0.6aaggy0.mongodb.net/?appName=Cluster0'

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    const db = client.db('ticket_Bari')
    const ticketCollection = db.collection('tickets')
    const bookCollection = db.collection('book')
    const paymentCollection = db.collection('payment')
    const userCollection = db.collection('users')
    app.get('/tickets', async(req ,res)=>{
      const result = await ticketCollection.find().toArray()
      res.send(result)
    })
    app.post('/tickets' , async(req , res)=>{
     const ticket = req.body
     ticket.verificationStatus = "pending"
     const result = await ticketCollection.insertOne(ticket) 
     res.send(result)
    })
    app.get('/tickets/:id', async(req , res)=>{
      const id =req.params.id
          const query = {_id : new ObjectId(id)}
      const result = await ticketCollection.findOne(query)
      res.send(result)
    })
    app.get('/myAddedTickets/:email' , async(req, res)=>{
      const email = req.params.email
      const result = await ticketCollection.find({vendorEmail: email}).toArray()
      res.send(result)
    })
    app.patch('/tickets/:id' , async(req , res)=>{
      const id = req.params.id
      const tickets = req.body
      const query = {_id : new ObjectId(id)}

      const update = {
        $set:{
           title: tickets.title,
        departure: tickets.departure, 
           from:tickets.from, 
           to:tickets.to,
           price:tickets.price,
            quantity:tickets.quantity,
            transportType:tickets.transportType
        }
      }
      const result = await ticketCollection.updateOne(query ,update)
      res.send(result)
    })
   app.delete('/tickets/:id' , async(req , res)=>{
      const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const result = await ticketCollection.deleteOne(query)
      res.send(result)
    })
   

app.post('/payment-checkout-session', async (req, res) => {
  try {
    const paymentInfo = req.body;
    console.log("BACKEND PAYMENT INFO:", paymentInfo);

    const amount = parseInt(paymentInfo.total) * 100;
    const quantity = parseInt(paymentInfo.quantity);

    console.log("AMOUNT:", amount, "QUANTITY:", quantity);

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: `please pay for ${paymentInfo.title}`
            }
          },
          quantity
        },
      ],
      mode: 'payment',
      metadata: {
        ticketsId: paymentInfo.ticketsId,
        title: paymentInfo.title,
        quantity: Number(paymentInfo.quantity)
      },
      customer_email: paymentInfo.userEmail,
      success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
    });

    res.send({ url: session.url });
  } catch (err) {
    console.log("STRIPE ERROR:", err);
    res.status(400).send({ error: err.message });
  }
});
// payment succuss 
  app.patch('/payment-success', async (req, res) => {
    try {
        const sessionId = req.query.session_id;

        if (!sessionId) return res.status(400).send({ success: false, message: "Session ID missing" });

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        console.log('Stripe session:', session);
  const transactionId = session.payment_intent
  const query = {transactionId : transactionId}
  const paymentExists = await paymentCollection.findOne(query)
  if(paymentExists){
    return res.send({message: 'already exists' , transactionId })
  }
          
        if (session.payment_status === 'paid') {
          const ticketsId = session.metadata.ticketsId;

            // const query = { _id: new ObjectId(ticketId) };
            const query = {_id : new ObjectId(ticketsId)}
            const update = { $set: 
              { 
                status: "paid"
               }
               };
              
            const result = await bookCollection.updateOne(query, update);

            const payment = {
                amount: session.amount_total / 100,
                currency: session.currency,
                customerEmail: session.customer_email,
          ticketsId:ticketsId,
                title: session.metadata.title,
                transactionId: session.payment_intent,
                paymentStatus: session.payment_status,
             quantity:session.metadata.quantity,
                paidAt: new Date(),
            };

            const resultPayment = await paymentCollection.insertOne(payment);
        

            // ✅ Send only one response here
        return res.send({
                success: true,
                modifyTicket: result,
                paymentInfo: resultPayment,
                transactionId: session.payment_intent,
                amount: session.amount_total / 100
            });
        }

        // Payment not completed
        return res.send({ success: false, message: "Payment not completed yet" });

    } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, message: "Server error" });
    }
});
app.get('/payments',  async(req , res)=>{
  const email = req.query.email
  const query = {}
  if(email){
    query.customerEmail = email
  }
 
 const  result = await paymentCollection.find(query).sort({paidAt: -1}).toArray()
 res.send(result)

})




    // book
    app.get('/myBookedTickets/:email' , async(req , res)=>{
      const email = req.params.email
      const result = await bookCollection.find({userEmail: email}).toArray()
      res.send(result)

    })
    app.post('/myBookTickets' , async(req ,res)=>{
      
      const books = req.body
      console.log(books)
      const query = {_id: new ObjectId(books.ticketId)}
    books.status = "pending"
   
      const update = {
        $inc:{quantity: -books.quantity}
      }
      await ticketCollection.updateOne(query , update)
       const result = await bookCollection.insertOne(books)
      res.send(result)
    })
    // app.get('/requested-bookings' , async(req , res)=>{
    //   const 
    // })

    // role
    app.get('/users/role/:email' , async(req , res)=>{
      const email = req.params.email
      const result = await userCollection.findOne({email: email})
      res.send({role: result?.role})
    })
  } 
  finally {
    // await client.close();
  }
}
run().catch(console.dir);
app.get('/' , (req , res)=>{
    res.send('TicketBari server is running')
})
app.listen(port , ()=>{
    console.log(`TicketBari server is running on port:${port}`)
})