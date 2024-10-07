async function connect(req, res){
    res.send('You are connected to you parse (node) backend, through the gateway!');
    res.status(200)
};

export default connect