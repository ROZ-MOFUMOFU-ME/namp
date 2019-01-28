DECLARE_FUNC(lyra2re){
    DECLARE_SCOPE;

    if (args.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

    Local<Object> target = args[0]->ToObject();

    if(!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    char * input = Buffer::Data(target);
    char* output = new char[32];

    lyra2re(input, output);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(lyra2re2){
    DECLARE_SCOPE;

    if (args.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

    Local<Object> target = args[0]->ToObject();

    if(!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    char * input = Buffer::Data(target);
    char* output = new char[32];

    lyra2re2(input, output);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(yescrypt){
    DECLARE_SCOPE;

    if (args.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

    Local<Object> target = args[0]->ToObject();

    if(!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");
    
   
    char * input = Buffer::Data(target);
    char* output = new char[32];

   
    yescrypt(input, output);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(yespower){
    DECLARE_SCOPE;

    if (args.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

    Local<Object> target = args[0]->ToObject();

    if(!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");


    char * input = Buffer::Data(target);
    char* output = new char[32];


    yespower(input, output);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(yespower_0_5_R8){
    DECLARE_SCOPE;

    if (args.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

   Local<Object> target = args[0]->ToObject();

   if(!Buffer::HasInstance(target))
       RETURN_EXCEPT("Argument should be a buffer object.");


   char * input = Buffer::Data(target);
   char* output = new char[32];


   yespower_0_5_R8(input, output);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(yespower_0_5_R8G){
    DECLARE_SCOPE;

    if (args.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

   Local<Object> target = args[0]->ToObject();

   if(!Buffer::HasInstance(target))
       RETURN_EXCEPT("Argument should be a buffer object.");


   char * input = Buffer::Data(target);
   uint32_t input_len = Buffer::Length(target);
   char* output = new char[32];


   yespower_0_5_R8G(input, input_len, output);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(yespower_0_5_R16){
    DECLARE_SCOPE;

    if (args.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

   Local<Object> target = args[0]->ToObject();

   if(!Buffer::HasInstance(target))
       RETURN_EXCEPT("Argument should be a buffer object.");


   char * input = Buffer::Data(target);
   char* output = new char[32];


   yespower_0_5_R16(input, output);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(yespower_0_5_R24){
    DECLARE_SCOPE;

    if (args.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

   Local<Object> target = args[0]->ToObject();

   if(!Buffer::HasInstance(target))
       RETURN_EXCEPT("Argument should be a buffer object.");


   char * input = Buffer::Data(target);
   char* output = new char[32];


   yespower_0_5_R24(input, output);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(yespower_0_5_R32){
    DECLARE_SCOPE;

    if (args.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

   Local<Object> target = args[0]->ToObject();

   if(!Buffer::HasInstance(target))
       RETURN_EXCEPT("Argument should be a buffer object.");


   char * input = Buffer::Data(target);
   char* output = new char[32];


   yespower_0_5_R32(input, output);

    SET_BUFFER_RETURN(output, 32);
}
