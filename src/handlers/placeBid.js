import AWS from 'aws-sdk';
import commonMiddleware from '../lib/commonMiddleware';
import createError from 'http-errors';
import { getAuctionById } from './getAuction';
import validator from '@middy/validator';
import placeBidSchema from '../lib/schemas/placeBidSchema';

const dynamoDb = new AWS.DynamoDB.DocumentClient();

async function placeBid(event, context) {
    const { id } = event.pathParameters;
    const { amount } = event.body;
    const { email } = event.requestContext.authorizer;

    const auction = await getAuctionById(id);

    if (email === auction.seller) {
        throw new createError.Forbidden(`You cannot bid on your own auctions!`);
    }

    if (email === auction.highestBid.bidder) {
        throw new createError.Forbidden(`You are already the highest bidder`);
    }

    if (auction.status !== 'OPEN') {
        throw new createError.Forbidden(`You cannot bid on closed auctions!`);
    }

    if (amount <= auction.highestBid.amount) {
        throw new createError.Forbidden(`Your bid must be higher than ${auction.highestBid.amount}!`);
    }

    const params = {
        TableName: process.env.AUCTIONS_TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET highestBid.amount = :amount, highestBid.bidder = :bidder',
        ExpressionAttributeValues: {
            ':amount': amount,
            ':bidder': email
        },
        ReturnValues: 'ALL_NEW'
    };

    let updatedAuction;

    try {
        const result = await dynamoDb.update(params).promise();
        updatedAuction = result.Attributes;
    } catch (error) {
        console.error(error);
        throw new createError.InternalServerError(error);
    }


    return {
        statusCode: 201,
        body: JSON.stringify(updatedAuction),
    };
}

export const handler = commonMiddleware(placeBid)
    .use(validator({ inputSchema: placeBidSchema }));