var express = require("express");  
var app = express();  
var server = require("http").createServer(app);
var io = require("socket.io")(server);

server.listen(3000);

app.use(express.static("public"));

var Web3 = require("web3");

web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:3001"));	
web3.eth.defaultAccount=web3.eth.accounts[0];
const defaultaddress=web3.eth.defaultAccount;
var ETHBelgradeSneakySnakeContract = web3.eth.contract([ { "constant": false, "inputs": [ { "name": "_points", "type": "uint256" } ], "name": "addingNewPoints", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": false, "inputs": [], "name": "endOfGame", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [], "name": "getPoints", "outputs": [ { "name": "", "type": "uint256" } ], "payable": false, "stateMutability": "view", "type": "function" } ]);
var ETHBelgradeSneakySnake = ETHBelgradeSneakySnakeContract.at(/* PUT YOUR ETH ADRESS HERE */);

app.get("/addingNewPoints", function(req, res){
	let points=req.query.score;
	ETHBelgradeSneakySnake.addingNewPoints(points);
    res.send("points added");
})

app.get("/getPoints",function(req,res){ res.send(ETHBelgradeSneakySnake.getPoints()); })

app.get("/endOfGame",function(req,res){
	ETHBelgradeSneakySnake.endOfGame();
	res.send("game-ended"); 
})

