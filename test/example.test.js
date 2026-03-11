import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';

describe('DemoTest', function() {
	it('should say 2+2 = 4', function() {
  	expect(1+2).toBe(3)
	});
});

describe('API TEST', () => {
  it('return 200 status code', async () => { 
    const response = await request(app).get('/api/listings');
    expect(response.statusCode).toBe(200);
    console.log(response.body);
  });
});
afterAll(async () => {
  await mongoose.connection.close();
});