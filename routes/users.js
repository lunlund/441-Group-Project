import express from 'express';
function requireLogin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required.' });
    next();
}
var router = express.Router();

/* GET users listing. */
router.get('/', requireLogin,async function(req, res, next) {
  const user=await req.models.User.findById(req.session.userId);
  res.json(user)
});

// router.put('/addToWatchList', requireLogin,async function(req, res, next) {
//   try{
//     console.log(req.query.itemId)
//     await req.models.User.findByIdAndUpdate(req.session.userId,
//     {
//       $addToSet: {watchlist: req.query.itemId}
//     }
//   );
//   res.json({})
//   } catch(error) {
//     console.log(error)
//     res.json({
//       error: "something wrong"
//     })
//   }
// });

router.get('/updateProfile',requireLogin,async(req,res,next)=>{
  try{
    await req.models.User.findByIdAndUpdate(req.session.userId,
      {
        $set: {
          bio: req.query.bio,
          location: req.query.location,
          balance: req.query.balance
        }
      }
    )
    res.json({})
  } catch(error) {
    res.status(500).json({error:error})
  }
})

router.delete('/deleteItem',requireLogin,async(req,res,next)=>{
  try {
    await req.models.User.findByIdAndUpdate(
      req.session.userId,
      {
        $pull: {watchlist: req.query.itemId}
      }
    )
    await req.models.Item.findByIdAndDelete(req.query.itemId)
    res.json({})
  } catch(error){
    res.status(500).json({error:error})
  }
})

router.get('/orders',requireLogin,async(req,res,next)=>{
  try {
    const user=await req.models.User.findById(req.session.userId)
    const orders=await Promise.all(
      user.orders.map(async(item)=>{
        return await req.models.Order.findById(item)
      })
    )
    console.log("orders",orders)
    res.json({
      orders: orders
    })
  } catch(error) {
    res.status(500).json({error:error})
  }
})

export default router;
