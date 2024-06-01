pragma solidity ^0.5.4;

contract ETHBelgradeSneakySnake{

	uint  points=0;

	function addingNewPoints(uint pointsToAdd) public { points += pointsToAdd; }

	function getPoints() public view returns(uint) {
		return points;
	}

	function endOfGame() public{
		points=0;
	}

}