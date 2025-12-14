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
    // middleware
     const verifyAdmin=async(req , res, next)=>{
    const email = req.tokenEmail
    const user = await userCollection.findOne({email})
    if(user.role !== 'admin' ){
      return res.status(403).send({message: 'Admin only actions!', role: user.role})
    }
    next()
  }
   const verifyVendor=async(req , res, next)=>{
    const email = req.tokenEmail
    const user = await userCollection.findOne({email})
    if(user.role !== 'vendor' ){
      return res.status(403).send({message: 'Seller only actions!', role: user.role})
    }
    next()
  }
    app.get('/tickets', async(req ,res)=>{
      
      const result = await ticketCollection.find().sort({createdAt: -1}).toArray()
      res.send(result)
    })
    app.get('/manage-tickets', verifyJwt, verifyAdmin, async(req ,res)=>{
      
      const result = await ticketCollection.find().sort({createdAt: -1}).toArray()
      res.send(result)
    })
    
    app.get('/allTickets', async(req ,res)=>{
      
      const result = await ticketCollection.find({verificationStatus: 'approved'}).toArray()
      res.send(result)
    })
    
    // approve

app.patch('/tickets/approve/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await ticketCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { verificationStatus: "approved" } }
    );
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});
app.patch('/tickets/reject/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await ticketCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { verificationStatus: "rejected" } }
    );
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});
// advertise
app.get('/advertisedCount', async (req, res) => {
  const count = await ticketCollection.countDocuments({ advertise: true });
  res.send({ count });
});

app.patch('/advertiseTickets/:id', async(req ,res)=>{
      const id = req.params.id
      const {advertise}=req.body
     if (advertise === true) {
    const count = await ticketCollection.countDocuments({ advertise: true });

    if (count >= 6) {
      return res.send({
        allowed: false,
        message: "Maximum 6 advertised tickets allowed."
      });
    }
  }
    
      const query = { _id: new ObjectId(id)}
      const update = {
        $set:{advertise :advertise}
      }
      const result = await ticketCollection.updateOne(query , update) 
        res.send({ allowed: true, ...result });
    })
     app.get('/advertiseTickets', verifyJwt, verifyAdmin, async(req ,res)=>{
      
      const result = await ticketCollection.find({verificationStatus: 'approved' , advertise: true}).toArray()
      res.send(result)
    })


app.get('/latest-tickets' , async(req , res)=>{
  const result = await ticketCollection.find().sort({createdAt: -1}).limit(6).toArray()
  res.send(result)
})
    app.post('/tickets' , verifyJwt, verifyVendor, async(req , res)=>{
     const ticket = req.body
     ticket.verificationStatus = "pending"
     ticket.createdAt = new Date().toISOString()
       if (ticket.isFraud === true) {
    return res.status(403).send({ message: "You are flagged as fraud, cannot add ticket" });
  }
     const result = await ticketCollection.insertOne(ticket) 
     res.send(result)
    })
    app.get('/tickets/:id', async(req , res)=>{
      const id =req.params.id
          const query = {_id : new ObjectId(id)}
      const result = await ticketCollection.findOne(query)
      res.send(result)
    })
    

    app.get('/myAddedTickets/:email', verifyJwt, verifyVendor, async (req, res) => {
  const email = req.params.email;

  
  const user = await userCollection.findOne({ email });
  if (!user) return res.status(404).send({ message: "User not found" });

  
  if (user.isFraud) return res.send([]);

  
  const tickets = await ticketCollection.find({ vendorEmail: email }).sort({
createdAt: -1}).toArray();
  res.send(tickets);
});



   
app.patch('/tickets/:id', async (req, res) => {
  const id = req.params.id;
  const data = req.body;

  const query = { _id: new ObjectId(id) };

  // ✅ Only update provided fields
  const updateFields = {};

  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined) {
      updateFields[key] = data[key];
    }
  });

  const update = {
    $set: updateFields,
  };

  const result = await ticketCollection.updateOne(query, update);
  res.send(result);
});


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
app.get('/payments', verifyJwt,verifyVendor,  async(req , res)=>{
  const email = req.query.email
  const query = {}
  if(email){
    query.userEmail = email
  }
 
 const  result = await bookCollection.find(query).sort({
bookingTime: -1}).toArray()
 res.send(result)

})

app.get('/paymentsHistory',  async(req , res)=>{
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
      const result = await bookCollection.find({userEmail: email}).sort({
bookingTime: -1}).toArray()
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
    // booking Status
  app.patch('/booking-accepted/:id' , async(req , res)=>{
    const id = req.params.id
     const query = {_id: new ObjectId(id)}
     const update = {
      $set:{
status : 'accepted'
      }
     }
     const result = await bookCollection.updateOne(query , update)
     res.send(result)

  })
  // reject

   app.patch('/booking-rejected/:id' , async(req , res)=>{

    const id = req.params.id
     const query = {_id: new ObjectId(id)}
     const update = {
      $set:{
status : 'rejected'
      }
     }

     const result = await bookCollection.updateOne(query , update)
 
     res.send(result)

  })


    // role
    app.get('/users/role/:email' , async(req , res)=>{
      const email = req.params.email
      const result = await userCollection.findOne({email: email})
      res.send({role: result?.role})
    })
    // admin

     app.get('/users',verifyJwt, verifyAdmin,  async (req, res) => {
            const searchText = req.query.searchText;
            const query = {};

            if (searchText) {
                // query.displayName = {$regex: searchText, $options: 'i'}

                query.$or = [
                    { displayName: { $regex: searchText, $options: 'i' } },
                    { email: { $regex: searchText, $options: 'i' } },
                ]

            }

            const cursor = userCollection.find(query).sort({ createdAt: -1 }).limit(5);
            const result = await cursor.toArray();
            res.send(result);
        });
           app.post('/users', async (req, res) => {
            const user = req.body;
            user.role = 'user';
            user.createdAt = new Date();
            const email = user.email;
            const userExists = await userCollection.findOne({ email })

            if (userExists) {
                return res.send({ message: 'user exists' })
            }

            const result = await userCollection.insertOne(user);
            res.send(result);
        })
        app.patch('/users/role/:id' , async(req, res)=>{
          const roleInfo = req.body
          const id = req.params.id
          const query = {_id : new ObjectId(id)}
          const update = {
            $set: {
              role: roleInfo.role
            }
          }
          const result = await userCollection.updateOne(query , update)
          res.send(result)
        })

        app.get('/users/:email', async(req, res)=>{
          const email = req.params.email;
          const query = {email : email}
          const user = await userCollection.findOne(query);
          if(!user){
            return res.status(404).send({message : "User not found"})
          }
          res.send(user)
        })

        app.patch('/users/markFraud/:id', async (req, res) => {
  try {
    const id = req.params.id;


    const userUpdate = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isFraud: true } }
    );

    const ticketUpdate = await ticketCollection.updateMany(
      { vendorId: id },
      { $set: { status: "hidden" } }
    );

    res.send({
      success: true,
      message: "Vendor marked as fraud and tickets hidden.",
      userUpdate,
      ticketUpdate
    });

  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, error: error.message });
  }
});
// revenue


app.get('/stats/revenue', async (req, res) => {
  const result = await paymentCollection.aggregate([
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]).toArray();

  const usd = result[0]?.total || 0;

  const bdt = usd * 117; 

  res.send({ totalRevenue: bdt });
});



app.get('/stats/tickets-sold', async (req, res) => {
  const sold = await paymentCollection.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: { $toInt: "$quantity" } }  
      }
    }
  ]).toArray();

  res.send({ totalTicketsSold: sold[0]?.total || 0 });
});




// Total Tickets Added 
app.get('/stats/tickets-added', async (req, res) => {
  const added = await ticketCollection.aggregate([
    { $group: { _id: null, total: { $sum: "$quantity" } } }
  ]).toArray();

  res.send({ totalTicketsAdded: added[0]?.total || 0 });
});

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